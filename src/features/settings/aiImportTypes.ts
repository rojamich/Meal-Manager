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
  ingredients: AiWeekRecipeIngredient[];
  instructions?: string[];
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
  recipes: AiWeekRecipe[];
  plannedMeals: AiWeekPlannedMeal[];
}

export interface AiImportSummary {
  recipesCreated: number;
  recipesReused: number;
  plannedMealsCreated: number;
  leftoverDowngradedToFreeform: number;
  replacedDates: string[];
}
