import {
  GroceryLine,
  GroceryList,
  PantryItem,
  RecipeIngredient
} from "../../models";
import { listPlannedMeals } from "../../db/repositories/mealPlanRepo";
import { listRecipes, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listEssentialItems } from "../../db/repositories/essentialsRepo";
import { listActiveLots } from "../../db/repositories/inventoryRepo";
import { createGroceryList, createGroceryLines } from "../../db/repositories/groceryRepo";
import { roundQty } from "../../utils/math";

export interface GroceryUsageEntry {
  label: string;
  date?: string;
  qty?: number;
  unit?: string;
  count?: number;
}

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

function mergeUsageEntries(entries: GroceryUsageEntry[]) {
  const merged = new Map<string, GroceryUsageEntry>();
  for (const entry of entries) {
    const key = [entry.label, entry.date || "", entry.unit || ""].join("|");
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        label: entry.label,
        date: entry.date,
        qty: entry.qty ?? 0,
        unit: entry.unit,
        count: entry.count ?? 1
      });
      continue;
    }
    existing.qty = (existing.qty ?? 0) + (entry.qty ?? 0);
    existing.count = (existing.count ?? 0) + (entry.count ?? 1);
  }
  return Array.from(merged.values()).sort((a, b) => {
    const dateCompare = (a.date || "").localeCompare(b.date || "");
    if (dateCompare !== 0) return dateCompare;
    return a.label.localeCompare(b.label);
  });
}

export function serializeGroceryUsageEntries(entries: GroceryUsageEntry[]) {
  return JSON.stringify(mergeUsageEntries(entries));
}

export function parseGroceryUsageEntries(raw: string | undefined) {
  if (!raw) return [] as GroceryUsageEntry[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return mergeUsageEntries(
        parsed
          .filter((entry): entry is GroceryUsageEntry => Boolean(entry && typeof entry === "object"))
          .map((entry) => ({
            label: String(entry.label || "Meal"),
            date: entry.date ? String(entry.date) : undefined,
            qty: typeof entry.qty === "number" ? entry.qty : undefined,
            unit: entry.unit ? String(entry.unit) : undefined,
            count: typeof entry.count === "number" ? entry.count : undefined
          }))
      );
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, number>).map(([label, count]) => ({
        label,
        date: undefined,
        qty: undefined,
        unit: undefined,
        count: Number(count) || 1
      }));
    }
    return [];
  } catch {
    return [];
  }
}

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

type SimulatedLot = {
  remaining: number;
  unopenedExpiresAt: string | null;
  firstUsedAt: string | null;
  openedExpiresAt: string | null;
};

function toDateFromISO(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`);
}

function addDaysISO(isoDate: string, days: number) {
  const d = toDateFromISO(isoDate);
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

function toSimulatedLots(activeLots: Awaited<ReturnType<typeof listActiveLots>>, pantryItemId: string) {
  return activeLots
    .filter((lot) => lot.pantryItemId === pantryItemId && lot.quantity > 0)
    .map((lot) => ({
      remaining: lot.quantity,
      unopenedExpiresAt: lot.expiresAt ? toISODateLocal(lot.expiresAt) : null,
      firstUsedAt: null,
      openedExpiresAt: null
    }))
    .sort((a, b) => {
      if (!a.unopenedExpiresAt && !b.unopenedExpiresAt) return 0;
      if (!a.unopenedExpiresAt) return 1;
      if (!b.unopenedExpiresAt) return -1;
      return a.unopenedExpiresAt.localeCompare(b.unopenedExpiresAt);
    });
}

function isLotUsableOnDate(lot: SimulatedLot, reqDate: string) {
  if (lot.remaining <= 0) return false;
  if (!lot.firstUsedAt) {
    if (!lot.unopenedExpiresAt) return true;
    return isOnOrAfter(lot.unopenedExpiresAt, reqDate);
  }
  if (!lot.openedExpiresAt) return true;
  return isOnOrAfter(lot.openedExpiresAt, reqDate);
}

function consumeForDate(
  lots: SimulatedLot[],
  reqDate: string,
  neededQty: number,
  defaultAfterOpeningDays?: number
) {
  let remainingNeed = neededQty;
  for (const lot of lots) {
    if (remainingNeed <= 0) break;
    if (!isLotUsableOnDate(lot, reqDate)) continue;
    const used = Math.min(lot.remaining, remainingNeed);
    if (used <= 0) continue;
    if (!lot.firstUsedAt) {
      lot.firstUsedAt = reqDate;
      lot.openedExpiresAt =
        defaultAfterOpeningDays && defaultAfterOpeningDays > 0
          ? addDaysISO(reqDate, defaultAfterOpeningDays)
          : null;
    }
    lot.remaining -= used;
    remainingNeed -= used;
  }
  return remainingNeed;
}

export async function buildGroceryLines(settings: GrocerySettings) {
  const pantryItems = await listPantryItems();
  const pantryItemById = new Map<string, PantryItem>(pantryItems.map((item) => [item.id, item]));
  const recipes = await listRecipes();
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const meals = await listPlannedMeals(settings.startDate, settings.endDate);
  const activeLots = await listActiveLots(settings.locationId);

  const neededByItem = new Map<string, number>();
  const neededByItemByDate = new Map<string, { date: string; qty: number }[]>();
  const usedForMap = new Map<string, GroceryUsageEntry[]>();
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

      const usedFor = usedForMap.get(ingredient.pantryItemId) ?? [];
      usedFor.push({
        label: recipe.title,
        date: meal.date,
        qty,
        unit: pantryItemById.get(ingredient.pantryItemId)?.baseUnit,
        count: 1
      });
      usedForMap.set(ingredient.pantryItemId, usedFor);
    }

    const isInPantryForDate = (pantryItemId: string, date: string) => {
      const reqDate = toISODateLocal(date);
      const lots = toSimulatedLots(activeLots, pantryItemId);
      return lots.some((lot) => isLotUsableOnDate(lot, reqDate));
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
          usedForJson: serializeGroceryUsageEntries([
            {
              label: recipe.title,
              date: meal.date,
              qty: 0,
              unit: item?.baseUnit || "count",
              count: 1
            }
          ]),
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
        usedForJson: serializeGroceryUsageEntries([
          {
            label: `${recipe.title} (${groupLabel} option)`,
            date: meal.date,
            qty,
            unit,
            count: 1
          }
        ]),
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
        const usedFor = usedForMap.get(item.pantryItemId) ?? [];
        usedFor.push({
          label: "Essentials",
          date: settings.startDate,
          qty: item.defaultQty,
          unit: pantryItemById.get(item.pantryItemId)?.baseUnit,
          count: 1
        });
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
          usedForJson: serializeGroceryUsageEntries([
            {
              label: "Essentials",
              date: settings.startDate,
              qty: item.defaultQty,
              unit: "count",
              count: 1
            }
          ]),
          checked: false
        });
      }
    }
  }

  const computeUnmetQty = (pantryItemId: string) => {
    const pantryItem = pantryItemById.get(pantryItemId);
    const requirements = [...(neededByItemByDate.get(pantryItemId) ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const lots = toSimulatedLots(activeLots, pantryItemId);
    let unmet = 0;
    for (const req of requirements) {
      const reqDate = toISODateLocal(req.date);
      const remainingNeed = consumeForDate(lots, reqDate, req.qty, pantryItem?.defaultAfterOpeningDays);
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
    const usedForJson = serializeGroceryUsageEntries(usedFor ?? []);

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
