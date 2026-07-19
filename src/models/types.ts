export type BaseUnit = "count" | "g" | "ml";
export type StorageType = "pantry" | "fridge" | "freezer";

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  storageType: StorageType;
  baseUnit: BaseUnit;
  defaultShelfLifeDays?: number;
  defaultAfterOpeningDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLot {
  id: string;
  pantryItemId: string;
  quantity: number;
  purchasedAt: string;
  expiresAt?: string;
  locationId?: string;
  archivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  url?: string;
  baseServings: number;
  defaultServings: number;
  mealTypes: string[];
  tags: string[];
  notes?: string;
  steps: string[];
  calories?: number;
  caloriesPerServing?: number;
  proteinGrams?: number;
  timeMinutes?: number;
  estimatedCostPerServing?: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  pantryItemId: string;
  quantity: number;
  altGroup?: string;
  prepNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealSlot {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Person {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
}

export interface CookedPortion {
  id: string;
  recipeId?: string;
  freeformTitle?: string;
  servingsTotal: number;
  servingsRemaining: number;
  cookedAt: string;
  expiresAt?: string;
  locationId?: string;
  sourcePlannedMealId?: string;
  archivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlannedMealType = "recipe" | "freeform" | "leftover";

export interface PlannedMeal {
  id: string;
  date: string;
  mealSlotId: string;
  type: PlannedMealType;
  recipeId?: string;
  sourcePlannedMealId?: string;
  leftoverSourceMealId?: string;
  leftoverServingsRemaining?: number;
  freeformTitle?: string;
  notes?: string;
  servingsPlanned?: number;
  assignedTo?: string;
  cookedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EssentialItem {
  id: string;
  pantryItemId?: string;
  freeformLabel?: string;
  defaultQty?: number;
  category?: string;
  includeWhenPantryEmpty: boolean;
  alwaysInclude: boolean;
  minStayDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationProfile {
  id: string;
  name: string;
  currencyCode: string;
  exchangeRateToUSD?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseEntry {
  id: string;
  pantryItemId: string;
  quantity: number;
  totalPrice: number;
  currencyCode: string;
  locationId?: string;
  store?: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryList {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  locationId?: string;
  settingsJson: string;
}

export interface GroceryLine {
  id: string;
  groceryListId: string;
  pantryItemId?: string;
  freeformLabel?: string;
  category?: string;
  altGroupLabel?: string;
  altOptionsJson?: string;
  neededQty: number;
  fromPantryQty: number;
  toBuyQty: number;
  unit: BaseUnit;
  usedForJson: string;
  checked: boolean;
}

export interface WeekTemplateMeal {
  mealSlotId: string;
  type: PlannedMealType;
  recipeId?: string;
  sourcePlannedMealId?: string;
  leftoverSourceMealId?: string;
  leftoverServingsRemaining?: number;
  freeformTitle?: string;
  notes?: string;
  servingsPlanned?: number;
}

export interface WeekTemplateDay {
  weekday: number;
  meals: WeekTemplateMeal[];
}

export interface WeekTemplate {
  id: string;
  schemaVersion: number;
  name: string;
  locationId?: string;
  days: WeekTemplateDay[];
  createdAt: string;
}

export interface ExportBundle {
  version: number;
  exportedAt: string;
  data: {
    pantryItems: PantryItem[];
    inventoryLots: InventoryLot[];
    recipes: Recipe[];
    recipeIngredients: RecipeIngredient[];
    mealSlots: MealSlot[];
    plannedMeals: PlannedMeal[];
    people?: Person[];
    essentialItems: EssentialItem[];
    locationProfiles: LocationProfile[];
    purchaseEntries: PurchaseEntry[];
    groceryLists: GroceryList[];
    groceryLines: GroceryLine[];
    weekTemplates: WeekTemplate[];
    cookedPortions?: CookedPortion[];
  };
}
