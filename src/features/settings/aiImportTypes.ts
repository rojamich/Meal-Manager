import { StorageType } from "../../models";
import { BaseUnit, PlannedMealType } from "../../models";

export interface AiWeekRecipeIngredient {
  itemName: string;
  quantity: number;
  unit: BaseUnit;
  notes?: string;
}

export interface AiWeekRecipe {
  id?: string;
  title: string;
  notes?: string;
  baseServings?: number;
  defaultServings?: number;
  mealTypes?: string[];
  tags?: string[] | string;
  caloriesPerServing?: number;
  proteinGramsPerServing?: number;
  timeMinutes?: number;
  estimatedCostPerServing?: number;
  imageUrl?: string;
  ingredients: AiWeekRecipeIngredient[];
  instructions?: string[];
}

export interface AiWeekPantryItem {
  name: string;
  category?: string;
  storageType?: StorageType;
  unit?: BaseUnit;
  defaultShelfLifeDays?: number;
  afterOpeningDays?: number;
  notes?: string;
}

export interface AiWeekPlannedMeal {
  ref?: string;
  date: string;
  mealSlotName: string;
  type: PlannedMealType;
  recipeRef?: string;
  leftoverSourceRef?: string;
  freeformTitle?: string;
  servingsPlanned?: number;
  notes?: string;
}

export interface AiWeekPlanDocument {
  version: 1;
  weekOf: string;
  startDate?: string;
  endDate?: string;
  _validMealSlots?: string[];
  _instructions?: string[];
  _schemaHints?: Record<string, string | string[]>;
  _aiPrompt?: string;
  pantryItems?: AiWeekPantryItem[];
  recipes: AiWeekRecipe[];
  plannedMeals: AiWeekPlannedMeal[];
}

export interface AiImportSummary {
  recipesCreated: number;
  recipesReused: number;
  plannedMealsCreated: number;
  leftoverDowngradedToFreeform: number;
  replacedDates: string[];
  warnings: string[];
}
