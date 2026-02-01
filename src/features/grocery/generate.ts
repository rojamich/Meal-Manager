import {
  GroceryLine,
  GroceryList
} from "../../models";
import { listPlannedMeals } from "../../db/repositories/mealPlanRepo";
import { listRecipes, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { listEssentialItems } from "../../db/repositories/essentialsRepo";
import { usableInventory } from "../../db/repositories/inventoryRepo";
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

export async function generateGroceryList(settings: GrocerySettings) {
  const pantryItems = await listPantryItems();
  const recipes = await listRecipes();
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const meals = await listPlannedMeals(settings.startDate, settings.endDate);
  const now = new Date();

  const neededByItem = new Map<string, number>();
  const usedForMap = new Map<string, Map<string, number>>();

  for (const meal of meals) {
    if (meal.type !== "recipe" || !meal.recipeId) continue;
    const recipe = recipeMap.get(meal.recipeId);
    if (!recipe) continue;
    const ingredients = await listIngredients(recipe.id);
    const servings = meal.servingsPlanned ?? recipe.defaultServings;
    const factor = servings / recipe.defaultServings;

    for (const ingredient of ingredients) {
      const qty = ingredient.quantity * factor;
      const prev = neededByItem.get(ingredient.pantryItemId) ?? 0;
      neededByItem.set(ingredient.pantryItemId, prev + qty);

      const usedFor = usedForMap.get(ingredient.pantryItemId) ?? new Map<string, number>();
      const usedLabel = `${recipe.title} (${formatDateLong(meal.date)})`;
      usedFor.set(usedLabel, (usedFor.get(usedLabel) ?? 0) + 1);
      usedForMap.set(ingredient.pantryItemId, usedFor);
    }
  }

  if (settings.includeEssentials) {
    const essentials = await listEssentialItems();
    for (const item of essentials) {
      const canIncludeByStay = !item.minStayDays || !settings.stayDays || settings.stayDays >= item.minStayDays;
      if (!canIncludeByStay) continue;
      if (!(item.alwaysInclude || (item.includeWhenPantryEmpty && settings.treatPantryAsEmpty))) continue;
      if (!item.pantryItemId || !item.defaultQty) continue;
      const prev = neededByItem.get(item.pantryItemId) ?? 0;
      neededByItem.set(item.pantryItemId, prev + item.defaultQty);
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
