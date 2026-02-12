import {
  GroceryLine,
  GroceryList,
  RecipeIngredient
} from "../../models";
import { listPlannedMeals } from "../../db/repositories/mealPlanRepo";
import { listRecipes, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listEssentialItems } from "../../db/repositories/essentialsRepo";
import { listActiveLots, usableInventory } from "../../db/repositories/inventoryRepo";
import { createGroceryList, createGroceryLines } from "../../db/repositories/groceryRepo";
import { roundQty } from "../../utils/math";
import { formatDateLong, parseISODate } from "../../utils/date";

export interface GrocerySettings {
  startDate: string;
  endDate: string;
  expiryBufferDays: number;
  includeEssentials: boolean;
  treatPantryAsEmpty: boolean;
  locationId?: string;
  stayDays?: number;
}

export async function buildGroceryLines(settings: GrocerySettings) {
  const pantryItems = await listPantryItems();
  const recipes = await listRecipes();
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const meals = await listPlannedMeals(settings.startDate, settings.endDate);
  const now = new Date();
  const startDate = parseISODate(settings.startDate);
  const activeLots = await listActiveLots(settings.locationId);

  const neededByItem = new Map<string, number>();
  const usedForMap = new Map<string, Map<string, number>>();
  const freeformLines: Omit<GroceryLine, "id">[] = [];

  for (const meal of meals) {
    if (meal.type !== "recipe" || !meal.recipeId) continue;
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    const ingredients = await listIngredients(recipe.id);
    const servings = meal.servingsPlanned ?? recipe.defaultServings;
    const factor = servings / recipe.defaultServings;

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
      const prev = neededByItem.get(ingredient.pantryItemId) ?? 0;
      neededByItem.set(ingredient.pantryItemId, prev + qty);

      const usedFor = usedForMap.get(ingredient.pantryItemId) ?? new Map<string, number>();
      const usedLabel = `${recipe.title} (${formatDateLong(meal.date)})`;
      usedFor.set(usedLabel, (usedFor.get(usedLabel) ?? 0) + 1);
      usedForMap.set(ingredient.pantryItemId, usedFor);
    }

    const isInPantry = (pantryItemId: string) => {
      // "In pantry" means there is a non-expired lot with qty > 0 as of startDate.
      return activeLots.some((lot) => {
        if (lot.pantryItemId !== pantryItemId) return false;
        if (!lot.quantity || lot.quantity <= 0) return false;
        if (!lot.expiresAt) return true;
        return parseISODate(lot.expiresAt) >= startDate;
      });
    };

    for (const [groupLabel, options] of altGroupMap.entries()) {
      let availableOption: RecipeIngredient | undefined;
      if (!settings.treatPantryAsEmpty) {
        for (const option of options) {
          if (isInPantry(option.pantryItemId)) {
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
      const optionNames = optionItems.map((item) => item?.name || "Option");
      const category = optionItems[0]?.category || "other";
      const unit = optionItems[0]?.baseUnit || "count";
      const label = optionNames.join(" OR ");
      freeformLines.push({
        groceryListId: "",
        freeformLabel: label,
        category,
        neededQty: 1,
        fromPantryQty: 0,
        toBuyQty: 1,
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
        const prev = neededByItem.get(item.pantryItemId) ?? 0;
        neededByItem.set(item.pantryItemId, prev + item.defaultQty);
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

  const lines: Omit<GroceryLine, "id">[] = [];
  for (const [pantryItemId, needed] of neededByItem.entries()) {
    const pantryItem = pantryItems.find((p) => p.id === pantryItemId);
    if (!pantryItem) continue;
    const fromPantry = settings.treatPantryAsEmpty
      ? 0
      : await usableInventory(pantryItemId, settings.expiryBufferDays, now, settings.locationId);
    const toBuy = Math.max(needed - fromPantry, 0);
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
