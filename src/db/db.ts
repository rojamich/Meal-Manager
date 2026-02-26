import Dexie, { Table } from "dexie";
import {
  PantryItem,
  InventoryLot,
  Recipe,
  RecipeIngredient,
  MealSlot,
  PlannedMeal,
  EssentialItem,
  LocationProfile,
  PurchaseEntry,
  GroceryList,
  GroceryLine,
  WeekTemplate,
  ExportBundle
} from "../models";

class MealDb extends Dexie {
  pantryItems!: Table<PantryItem, string>;
  inventoryLots!: Table<InventoryLot, string>;
  recipes!: Table<Recipe, string>;
  recipeIngredients!: Table<RecipeIngredient, string>;
  mealSlots!: Table<MealSlot, string>;
  plannedMeals!: Table<PlannedMeal, string>;
  essentialItems!: Table<EssentialItem, string>;
  locationProfiles!: Table<LocationProfile, string>;
  purchaseEntries!: Table<PurchaseEntry, string>;
  groceryLists!: Table<GroceryList, string>;
  groceryLines!: Table<GroceryLine, string>;
  weekTemplates!: Table<WeekTemplate, string>;

  constructor() {
    super("meal-manager-db");
    this.version(1).stores({
      pantryItems: "id, name, category",
      inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
      recipes: "id, title",
      recipeIngredients: "id, recipeId, pantryItemId",
      mealSlots: "id, sortOrder",
      plannedMeals: "id, date, mealSlotId, type, recipeId",
      essentialItems: "id, pantryItemId, category",
      locationProfiles: "id, name",
      purchaseEntries: "id, pantryItemId, locationId, date",
      groceryLists: "id, startDate, endDate, locationId",
      groceryLines: "id, groceryListId, pantryItemId, checked"
    });

    this.version(2)
      .stores({
        pantryItems: "id, name, category",
        inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
        recipes: "id, title",
        recipeIngredients: "id, recipeId, pantryItemId",
        mealSlots: "id, sortOrder",
        plannedMeals: "id, date, mealSlotId, type, recipeId",
        essentialItems: "id, pantryItemId, category",
        locationProfiles: "id, name",
        purchaseEntries: "id, pantryItemId, locationId, date",
        groceryLists: "id, createdAt, startDate, endDate, locationId",
        groceryLines: "id, groceryListId, pantryItemId, checked",
        weekTemplates: "id, name, locationId, createdAt"
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString();
        await tx.table("groceryLists").toCollection().modify((list: any) => {
          if (!list.createdAt) list.createdAt = now;
        });
      });

    this.version(3).stores({
      pantryItems: "id, name, category",
      inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
      recipes: "id, title",
      recipeIngredients: "id, recipeId, pantryItemId",
      mealSlots: "id, sortOrder",
      plannedMeals: "id, date, mealSlotId, type, recipeId",
      essentialItems: "id, pantryItemId, category",
      locationProfiles: "id, name",
      purchaseEntries: "id, pantryItemId, locationId, date",
      groceryLists: "id, createdAt, startDate, endDate, locationId",
      groceryLines: "id, groceryListId, pantryItemId, checked",
      weekTemplates: "id, name, locationId, createdAt"
    });

    this.version(4)
      .stores({
        pantryItems: "id, name, category",
        inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
        recipes: "id, title",
        recipeIngredients: "id, recipeId, pantryItemId",
        mealSlots: "id, sortOrder",
        plannedMeals: "id, date, mealSlotId, type, recipeId",
        essentialItems: "id, pantryItemId, category",
        locationProfiles: "id, name",
        purchaseEntries: "id, pantryItemId, locationId, date",
        groceryLists: "id, createdAt, startDate, endDate, locationId",
        groceryLines: "id, groceryListId, pantryItemId, checked",
        weekTemplates: "id, name, locationId, createdAt"
      })
      .upgrade(async (tx) => {
        await tx.table("recipes").toCollection().modify((recipe: any) => {
          const servings = Math.max(Number(recipe.baseServings ?? recipe.defaultServings ?? 2), 1);
          recipe.baseServings = servings;
          recipe.defaultServings = servings;
        });
      });

    this.version(5)
      .stores({
        pantryItems: "id, name, category",
        inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
        recipes: "id, title",
        recipeIngredients: "id, recipeId, pantryItemId",
        mealSlots: "id, sortOrder",
        plannedMeals: "id, date, mealSlotId, type, recipeId",
        essentialItems: "id, pantryItemId, category",
        locationProfiles: "id, name",
        purchaseEntries: "id, pantryItemId, locationId, date",
        groceryLists: "id, createdAt, startDate, endDate, locationId",
        groceryLines: "id, groceryListId, pantryItemId, checked",
        weekTemplates: "id, name, locationId, createdAt"
      })
      .upgrade(async (tx) => {
        await tx.table("recipes").toCollection().modify((recipe: any) => {
          if (recipe.calories === undefined && recipe.caloriesPerServing !== undefined) {
            recipe.calories = Number.isFinite(Number(recipe.caloriesPerServing))
              ? Number(recipe.caloriesPerServing)
              : undefined;
          }
          if (recipe.proteinGrams !== undefined && !Number.isFinite(Number(recipe.proteinGrams))) {
            recipe.proteinGrams = undefined;
          }
          if (recipe.timeMinutes !== undefined && !Number.isFinite(Number(recipe.timeMinutes))) {
            recipe.timeMinutes = undefined;
          }
        });
      });
  }
}

export const db = new MealDb();

export async function initDb() {
  await db.open();
  await seedDefaults();
}

async function seedDefaults() {
  const count = await db.mealSlots.count();
  if (count === 0) {
    await db.mealSlots.bulkAdd([
      { id: "breakfast", name: "Breakfast", sortOrder: 1 },
      { id: "lunch", name: "Lunch", sortOrder: 2 },
      { id: "dinner", name: "Dinner", sortOrder: 3 },
      { id: "snack", name: "Snack", sortOrder: 4 }
    ]);
  }
}

export async function exportAll(): Promise<ExportBundle> {
  const bundle: ExportBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      pantryItems: await db.pantryItems.toArray(),
      inventoryLots: await db.inventoryLots.toArray(),
      recipes: await db.recipes.toArray(),
      recipeIngredients: await db.recipeIngredients.toArray(),
      mealSlots: await db.mealSlots.toArray(),
      plannedMeals: await db.plannedMeals.toArray(),
      essentialItems: await db.essentialItems.toArray(),
      locationProfiles: await db.locationProfiles.toArray(),
      purchaseEntries: await db.purchaseEntries.toArray(),
      groceryLists: await db.groceryLists.toArray(),
      groceryLines: await db.groceryLines.toArray(),
      weekTemplates: await db.weekTemplates.toArray()
    }
  };
  return bundle;
}

export async function importAll(bundle: ExportBundle, replaceAll = true) {
  await db.transaction(
    "rw",
    [
      db.pantryItems,
      db.inventoryLots,
      db.recipes,
      db.recipeIngredients,
      db.mealSlots,
      db.plannedMeals,
      db.essentialItems,
      db.locationProfiles,
      db.purchaseEntries,
      db.groceryLists,
      db.groceryLines,
      db.weekTemplates
    ],
    async () => {
      if (replaceAll) {
        await db.pantryItems.clear();
        await db.inventoryLots.clear();
        await db.recipes.clear();
        await db.recipeIngredients.clear();
        await db.mealSlots.clear();
        await db.plannedMeals.clear();
        await db.essentialItems.clear();
        await db.locationProfiles.clear();
        await db.purchaseEntries.clear();
        await db.groceryLists.clear();
        await db.groceryLines.clear();
        await db.weekTemplates.clear();
      }
      await db.pantryItems.bulkAdd(bundle.data.pantryItems);
      await db.inventoryLots.bulkAdd(bundle.data.inventoryLots);
      await db.recipes.bulkAdd(bundle.data.recipes);
      await db.recipeIngredients.bulkAdd(bundle.data.recipeIngredients);
      await db.mealSlots.bulkAdd(bundle.data.mealSlots);
      await db.plannedMeals.bulkAdd(bundle.data.plannedMeals);
      await db.essentialItems.bulkAdd(bundle.data.essentialItems);
      await db.locationProfiles.bulkAdd(bundle.data.locationProfiles);
      await db.purchaseEntries.bulkAdd(bundle.data.purchaseEntries);
      await db.groceryLists.bulkAdd(bundle.data.groceryLists);
      await db.groceryLines.bulkAdd(bundle.data.groceryLines);
      await db.weekTemplates.bulkAdd(bundle.data.weekTemplates || []);
    }
  );
  await seedDefaults();
}
