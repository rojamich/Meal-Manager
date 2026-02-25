import {
  GroceryLine,
  GroceryList,
  RecipeIngredient
} from "../../models";
import { listPlannedMeals } from "../../db/repositories/mealPlanRepo";
import { listRecipes, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listEssentialItems } from "../../db/repositories/essentialsRepo";
import { listActiveLots } from "../../db/repositories/inventoryRepo";
import { createGroceryList, createGroceryLines } from "../../db/repositories/groceryRepo";
import { roundQty } from "../../utils/math";
import { formatDateLong } from "../../utils/date";

export interface GrocerySettings {
  startDate: string;
  endDate: string;
  expiryBufferDays: number;
  includeEssentials: boolean;
  treatPantryAsEmpty: boolean;
  locationId?: string;
  stayDays?: number;
}

const DEBUG_CONSUMPTION = false;

function toISODateLocal(input: Date | string) {
  if (typeof input === "string") return input.slice(0, 10);
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isOnOrAfter(aISO: string, bISO: string) {
  return aISO >= bISO;
}

export async function buildGroceryLines(settings: GrocerySettings) {
  const pantryItems = await listPantryItems();
  const recipes = await listRecipes();
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const meals = await listPlannedMeals(settings.startDate, settings.endDate);
  const activeLots = await listActiveLots(settings.locationId);

  const neededByItem = new Map<string, number>();
  const neededByItemByDate = new Map<string, { date: string; qty: number }[]>();
  const usedForMap = new Map<string, Map<string, number>>();
  const freeformLines: Omit<GroceryLine, "id">[] = [];

  const addNeeded = (pantryItemId: string, date: string, qty: number) => {
    const prevTotal = neededByItem.get(pantryItemId) ?? 0;
    neededByItem.set(pantryItemId, prevTotal + qty);
    const list = neededByItemByDate.get(pantryItemId) ?? [];
    list.push({ date, qty });
    neededByItemByDate.set(pantryItemId, list);
  };

  for (const meal of meals) {
    if (meal.type !== "recipe" || !meal.recipeId) continue;
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    const ingredients = await listIngredients(recipe.id);
    const recipeBaseServings = Math.max(recipe.baseServings ?? recipe.defaultServings ?? 1, 1);
    const servings = meal.servingsPlanned ?? recipeBaseServings;
    const factor = servings / recipeBaseServings;

    const normalIngredients = ingredients.filter((ing) => !ing.altGroup?.trim());
    const altGroupMap = new Map<string, RecipeIngredient[]>();
    for (const ing of ingredients) {
      const group = ing.altGroup?.trim();
      if (!group) continue;
      const list = altGroupMap.get(group) ?? [];
      list.push(ing);
      altGroupMap.set(group, list);
    }

    for (const ingredient of normalIngredients) {
      const qty = ingredient.quantity * factor;
      addNeeded(ingredient.pantryItemId, meal.date, qty);

      const usedFor = usedForMap.get(ingredient.pantryItemId) ?? new Map<string, number>();
      const usedLabel = `${recipe.title} (${formatDateLong(meal.date)})`;
      usedFor.set(usedLabel, (usedFor.get(usedLabel) ?? 0) + 1);
      usedForMap.set(ingredient.pantryItemId, usedFor);
    }

    const isInPantryForDate = (pantryItemId: string, date: string) => {
      const reqDate = toISODateLocal(date);
      // "In pantry" means a non-expired lot with qty > 0 for that meal date.
      return activeLots.some((lot) => {
        if (lot.pantryItemId !== pantryItemId) return false;
        if (!lot.quantity || lot.quantity <= 0) return false;
        if (!lot.expiresAt) return true;
        return isOnOrAfter(toISODateLocal(lot.expiresAt), reqDate);
      });
    };

    for (const [groupLabel, options] of altGroupMap.entries()) {
      let availableOption: RecipeIngredient | undefined;
      if (!settings.treatPantryAsEmpty) {
        for (const option of options) {
          if (isInPantryForDate(option.pantryItemId, meal.date)) {
            availableOption = option;
            break;
          }
        }
      }
      if (availableOption) {
        const item = pantryItems.find((p) => p.id === availableOption.pantryItemId);
        const label = `${groupLabel}: using ${item?.name || "Option"} (in pantry)`;
        freeformLines.push({
          groceryListId: "",
          freeformLabel: label,
          category: item?.category || "other",
          neededQty: 0,
          fromPantryQty: 0,
          toBuyQty: 0,
          unit: item?.baseUnit || "count",
          usedForJson: JSON.stringify({
            [`${recipe.title} (${formatDateLong(meal.date)})`]: 1
          }),
          checked: false
        });
        continue;
      }

      const optionItems = options
        .map((opt) => pantryItems.find((p) => p.id === opt.pantryItemId))
        .filter(Boolean);
      const qty = (options[0]?.quantity ?? 1) * factor;
      const optionNames = optionItems.map((item) => item?.name || "Option");
      const category = optionItems[0]?.category || "other";
      const unit = optionItems[0]?.baseUnit || "count";
      const label = optionNames.join(" OR ");
      freeformLines.push({
        groceryListId: "",
        freeformLabel: label,
        category,
        altGroupLabel: groupLabel,
        altOptionsJson: JSON.stringify(options.map((opt) => opt.pantryItemId)),
        neededQty: qty,
        fromPantryQty: 0,
        toBuyQty: qty,
        unit,
        usedForJson: JSON.stringify({
          [`${recipe.title} (${groupLabel} option)`]: 1
        }),
        checked: false
      });
    }
  }

  if (settings.includeEssentials) {
    const essentials = await listEssentialItems();
    for (const item of essentials) {
      const canIncludeByStay = !item.minStayDays || !settings.stayDays || settings.stayDays >= item.minStayDays;
      if (!canIncludeByStay) continue;
      if (!(item.alwaysInclude || (item.includeWhenPantryEmpty && settings.treatPantryAsEmpty))) continue;
      if (item.pantryItemId && item.defaultQty) {
        addNeeded(item.pantryItemId, settings.startDate, item.defaultQty);
        const usedFor = usedForMap.get(item.pantryItemId) ?? new Map<string, number>();
        usedFor.set("Essentials", (usedFor.get("Essentials") ?? 0) + 1);
        usedForMap.set(item.pantryItemId, usedFor);
      }
      if (item.freeformLabel && item.defaultQty) {
        freeformLines.push({
          groceryListId: "",
          freeformLabel: item.freeformLabel,
          category: item.category || "other",
          neededQty: item.defaultQty,
          fromPantryQty: 0,
          toBuyQty: item.defaultQty,
          unit: "count",
          usedForJson: JSON.stringify({ Essentials: 1 }),
          checked: false
        });
      }
    }
  }

  const computeUnmetQty = (pantryItemId: string) => {
    const requirements = [...(neededByItemByDate.get(pantryItemId) ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const lots = activeLots
      .filter((lot) => lot.pantryItemId === pantryItemId)
      .map((lot) => ({
        remaining: lot.quantity,
        expiresAt: lot.expiresAt ? toISODateLocal(lot.expiresAt) : null
      }));
    let unmet = 0;
    for (const req of requirements) {
      let remainingNeed = req.qty;
      const reqDate = toISODateLocal(req.date);
      for (const lot of lots) {
        if (remainingNeed <= 0) break;
        if (lot.remaining <= 0) continue;
        if (lot.expiresAt && !isOnOrAfter(lot.expiresAt, reqDate)) continue;
        const used = Math.min(lot.remaining, remainingNeed);
        lot.remaining -= used;
        remainingNeed -= used;
      }
      if (remainingNeed > 0) unmet += remainingNeed;
    }
    return unmet;
  };

  if (DEBUG_CONSUMPTION) {
    const demoLots = [
      { remaining: 2, expiresAt: "2026-02-10" },
      { remaining: 2, expiresAt: "2026-02-20" }
    ];
    const demoReqs = [
      { date: "2026-02-09", qty: 2 },
      { date: "2026-02-15", qty: 2 }
    ];
    let unmet = 0;
    for (const req of demoReqs) {
      let remainingNeed = req.qty;
      for (const lot of demoLots) {
        if (remainingNeed <= 0) break;
        if (lot.remaining <= 0) continue;
        if (lot.expiresAt && !isOnOrAfter(lot.expiresAt, req.date)) continue;
        const used = Math.min(lot.remaining, remainingNeed);
        lot.remaining -= used;
        remainingNeed -= used;
      }
      if (remainingNeed > 0) unmet += remainingNeed;
    }
    console.log("[Grocery] demo unmet qty:", unmet);
  }

  const lines: Omit<GroceryLine, "id">[] = [];
  for (const [pantryItemId, needed] of neededByItem.entries()) {
    const pantryItem = pantryItems.find((p) => p.id === pantryItemId);
    if (!pantryItem) continue;
    const unmet = settings.treatPantryAsEmpty ? needed : computeUnmetQty(pantryItemId);
    const toBuy = Math.max(unmet, 0);
    if (toBuy <= 0) continue;
    const fromPantry = Math.max(needed - toBuy, 0);
    const usedFor = usedForMap.get(pantryItemId);
    const usedForJson = JSON.stringify(Object.fromEntries(usedFor ?? []));

    lines.push({
      groceryListId: "",
      pantryItemId,
      neededQty: roundQty(needed),
      fromPantryQty: roundQty(fromPantry),
      toBuyQty: roundQty(toBuy),
      unit: pantryItem.baseUnit,
      usedForJson,
      checked: false
    });
  }

  const allLines = [...lines, ...freeformLines];
  return { lines: allLines, pantryItems };
}

export async function generateGroceryList(settings: GrocerySettings) {
  const { lines, pantryItems } = await buildGroceryLines(settings);
  const listInput: Omit<GroceryList, "id" | "createdAt"> = {
    startDate: settings.startDate,
    endDate: settings.endDate,
    locationId: settings.locationId,
    settingsJson: JSON.stringify(settings)
  };

  const list = await createGroceryList(listInput);
  const linesWithList = lines.map((line) => ({ ...line, groceryListId: list.id }));
  const storedLines = await createGroceryLines(linesWithList);

  return { list, lines: storedLines, pantryItems };
}
