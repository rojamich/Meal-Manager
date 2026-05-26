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
  Person,
  CookedPortion,
  PurchaseEntry,
  GroceryList,
  GroceryLine,
  WeekTemplate,
  ExportBundle
} from "../models";
import { STARTER_WEEK_TEMPLATES } from "./seedTemplates";
import { newId } from "../utils/id";

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
  people!: Table<Person, string>;
  cookedPortions!: Table<CookedPortion, string>;

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

    this.version(6)
      .stores({
        pantryItems: "id, name, category, storageType",
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
        await tx.table("pantryItems").toCollection().modify((item: any) => {
          if (!item.storageType) item.storageType = "pantry";
        });
      });

    this.version(7).stores({
      pantryItems: "id, name, category, storageType",
      inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
      recipes: "id, title",
      recipeIngredients: "id, recipeId, pantryItemId",
      mealSlots: "id, sortOrder",
      plannedMeals: "id, date, mealSlotId, type, recipeId, assignedTo",
      essentialItems: "id, pantryItemId, category",
      locationProfiles: "id, name",
      purchaseEntries: "id, pantryItemId, locationId, date",
      groceryLists: "id, createdAt, startDate, endDate, locationId",
      groceryLines: "id, groceryListId, pantryItemId, checked",
      weekTemplates: "id, name, locationId, createdAt",
      people: "id, name, sortOrder"
    });

    this.version(8).stores({
      pantryItems: "id, name, category, storageType",
      inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
      recipes: "id, title",
      recipeIngredients: "id, recipeId, pantryItemId",
      mealSlots: "id, sortOrder",
      plannedMeals: "id, date, mealSlotId, type, recipeId, assignedTo",
      essentialItems: "id, pantryItemId, category",
      locationProfiles: "id, name",
      purchaseEntries: "id, pantryItemId, locationId, date",
      groceryLists: "id, createdAt, startDate, endDate, locationId",
      groceryLines: "id, groceryListId, pantryItemId, checked",
      weekTemplates: "id, name, locationId, createdAt",
      people: "id, name, sortOrder",
      cookedPortions: "id, recipeId, cookedAt, archivedAt, locationId, sourcePlannedMealId"
    });

    this.version(9)
      .stores({
        pantryItems: "id, name, category, storageType",
        inventoryLots: "id, pantryItemId, locationId, archivedAt, expiresAt",
        recipes: "id, title",
        recipeIngredients: "id, recipeId, pantryItemId",
        mealSlots: "id, sortOrder",
        plannedMeals: "id, date, mealSlotId, type, recipeId, assignedTo",
        essentialItems: "id, pantryItemId, category",
        locationProfiles: "id, name",
        purchaseEntries: "id, pantryItemId, locationId, date",
        groceryLists: "id, createdAt, startDate, endDate, locationId",
        groceryLines: "id, groceryListId, pantryItemId, checked",
        weekTemplates: "id, name, locationId, createdAt",
        people: "id, name, sortOrder",
        cookedPortions: "id, recipeId, cookedAt, archivedAt, locationId, sourcePlannedMealId"
      })
      .upgrade(async (tx) => {
        await tx.table("plannedMeals").toCollection().modify((meal: any) => {
          if (meal.type === "leftover") {
            meal.type = "freeform";
            if (!meal.freeformTitle) meal.freeformTitle = "Leftovers";
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
  const peopleCount = await db.people.count();
  if (peopleCount === 0) {
    await db.people.bulkAdd([
      { id: "person-mike", name: "Mike", color: "#2563eb", sortOrder: 1 },
      { id: "person-jen", name: "Jen", color: "#db2777", sortOrder: 2 }
    ]);
  }
  const templateCount = await db.weekTemplates.count();
  if (templateCount === 0) {
    const now = new Date().toISOString();
    await db.weekTemplates.bulkAdd(
      STARTER_WEEK_TEMPLATES.map((template) => ({
        ...template,
        id: newId(),
        createdAt: now
      }))
    );
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
      weekTemplates: await db.weekTemplates.toArray(),
      people: await db.people.toArray(),
      cookedPortions: await db.cookedPortions.toArray()
    }
  };
  return bundle;
}

function validateBundle(bundle: unknown): ExportBundle {
  if (!bundle || typeof bundle !== "object") {
    throw new Error("Backup file is not a valid JSON object.");
  }
  const b = bundle as Partial<ExportBundle> & { data?: any };
  if (!b.data || typeof b.data !== "object") {
    throw new Error("Backup file is missing the 'data' section.");
  }
  const arr = (value: unknown) => (Array.isArray(value) ? value : []);
  const data = {
    pantryItems: arr(b.data.pantryItems),
    inventoryLots: arr(b.data.inventoryLots),
    recipes: arr(b.data.recipes),
    recipeIngredients: arr(b.data.recipeIngredients),
    mealSlots: arr(b.data.mealSlots),
    plannedMeals: arr(b.data.plannedMeals),
    essentialItems: arr(b.data.essentialItems),
    locationProfiles: arr(b.data.locationProfiles),
    purchaseEntries: arr(b.data.purchaseEntries),
    groceryLists: arr(b.data.groceryLists),
    groceryLines: arr(b.data.groceryLines),
    weekTemplates: arr(b.data.weekTemplates),
    people: arr(b.data.people),
    cookedPortions: arr(b.data.cookedPortions)
  };
  if (!data.pantryItems.length && !data.recipes.length && !data.plannedMeals.length) {
    throw new Error("Backup file looks empty — no pantry items, recipes, or planned meals found.");
  }
  return {
    version: typeof b.version === "number" ? b.version : 1,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : new Date().toISOString(),
    data
  };
}

export async function importAll(rawBundle: unknown, replaceAll = true) {
  const bundle = validateBundle(rawBundle);
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
      db.weekTemplates,
      db.people,
      db.cookedPortions
    ],
    async () => {
      if (replaceAll) {
        await Promise.all([
          db.pantryItems.clear(),
          db.inventoryLots.clear(),
          db.recipes.clear(),
          db.recipeIngredients.clear(),
          db.mealSlots.clear(),
          db.plannedMeals.clear(),
          db.essentialItems.clear(),
          db.locationProfiles.clear(),
          db.purchaseEntries.clear(),
          db.groceryLists.clear(),
          db.groceryLines.clear(),
          db.weekTemplates.clear(),
          db.people.clear(),
          db.cookedPortions.clear()
        ]);
      }
      await db.pantryItems.bulkPut(bundle.data.pantryItems);
      await db.inventoryLots.bulkPut(bundle.data.inventoryLots);
      await db.recipes.bulkPut(bundle.data.recipes);
      await db.recipeIngredients.bulkPut(bundle.data.recipeIngredients);
      await db.mealSlots.bulkPut(bundle.data.mealSlots);
      await db.plannedMeals.bulkPut(bundle.data.plannedMeals);
      await db.essentialItems.bulkPut(bundle.data.essentialItems);
      await db.locationProfiles.bulkPut(bundle.data.locationProfiles);
      await db.purchaseEntries.bulkPut(bundle.data.purchaseEntries);
      await db.groceryLists.bulkPut(bundle.data.groceryLists);
      await db.groceryLines.bulkPut(bundle.data.groceryLines);
      await db.weekTemplates.bulkPut(bundle.data.weekTemplates);
      await db.people.bulkPut(bundle.data.people || []);
      await db.cookedPortions.bulkPut(bundle.data.cookedPortions || []);
    }
  );
  await seedDefaults();
}
