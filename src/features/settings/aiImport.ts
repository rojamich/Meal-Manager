import { addIngredient, createRecipe, listRecipes } from "../../db/repositories/recipeRepo";
import { createPantryItem, listPantryItems } from "../../db/repositories/pantryRepo";
import { listMealSlots, listPlannedMeals } from "../../db/repositories/mealPlanRepo";
import {
  buildFreeformMealInput,
  buildLeftoverMealInput,
  buildRecipeMealInput,
  createMealWithRules,
  deleteMealWithRules
} from "../planner/plannerDomain";
import { getHouseholdSize } from "./preferences";
import { AiImportSummary, AiWeekPlanDocument, AiWeekPlannedMeal, AiWeekRecipe } from "./aiImportTypes";
import { BaseUnit, MealSlot, PantryItem, PlannedMeal, Recipe } from "../../models";
import { dateKey, addDays, parseISODate } from "../../utils/date";

type ValidationResult =
  | { ok: true; document: AiWeekPlanDocument; slotMap: Map<string, MealSlot> }
  | { ok: false; errors: string[] };

function normalizeKey(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function isValidIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseISODate(value);
  return dateKey(parsed) === value;
}

function normalizePositiveInt(value: number | undefined, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(Math.round(num), 1);
}

function normalizeUnit(value: string | undefined): BaseUnit {
  const normalized = normalizeKey(value);
  if (normalized === "g" || normalized === "gram" || normalized === "grams") return "g";
  if (normalized === "ml" || normalized === "milliliter" || normalized === "milliliters") return "ml";
  return "count";
}

function normalizeAiRecipe(recipe: AiWeekRecipe): AiWeekRecipe {
  return {
    ...recipe,
    title: String(recipe.title || "").trim(),
    notes: recipe.notes?.trim() || undefined,
    baseServings: normalizePositiveInt(recipe.baseServings, 2),
    defaultServings: normalizePositiveInt(recipe.defaultServings ?? recipe.baseServings, normalizePositiveInt(recipe.baseServings, 2)),
    mealTypes: (recipe.mealTypes || []).map((value) => String(value || "").trim()).filter(Boolean),
    ingredients: (recipe.ingredients || []).map((ingredient) => ({
      itemName: String(ingredient.itemName || "").trim(),
      quantity: Number(ingredient.quantity || 0),
      unit: normalizeUnit(ingredient.unit),
      notes: ingredient.notes?.trim() || undefined
    })),
    instructions: (recipe.instructions || []).map((step) => String(step || "").trim()).filter(Boolean)
  };
}

function normalizeAiPlannedMeal(meal: AiWeekPlannedMeal): AiWeekPlannedMeal {
  return {
    ...meal,
    ref: meal.ref?.trim() || undefined,
    date: String(meal.date || "").trim(),
    mealSlotName: String(meal.mealSlotName || "").trim(),
    type: meal.type,
    recipeRef: meal.recipeRef?.trim() || undefined,
    leftoverSourceRef: meal.leftoverSourceRef?.trim() || undefined,
    freeformTitle: meal.freeformTitle?.trim() || undefined,
    servingsPlanned: meal.servingsPlanned ? normalizePositiveInt(meal.servingsPlanned, 1) : undefined,
    notes: meal.notes?.trim() || undefined
  };
}

function formatValidationError(errors: string[]) {
  return errors.join("\n");
}

export function parseAndValidateAiWeekPlan(raw: string, slots: MealSlot[]): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["AI import JSON could not be parsed. Please check for invalid commas or quotes."] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["AI import file must contain a JSON object."] };
  }

  const doc = parsed as Partial<AiWeekPlanDocument>;
  const errors: string[] = [];
  if (doc.version !== 1) errors.push("Unsupported AI import version. Expected version 1.");
  if (!isValidIsoDate(doc.weekOf)) errors.push("weekOf must be a valid YYYY-MM-DD date.");
  if (!Array.isArray(doc.recipes)) errors.push("recipes must be an array.");
  if (!Array.isArray(doc.plannedMeals)) errors.push("plannedMeals must be an array.");
  if (errors.length) return { ok: false, errors };

  const normalizedRecipes = doc.recipes!.map(normalizeAiRecipe);
  const normalizedMeals = doc.plannedMeals!.map(normalizeAiPlannedMeal);
  const recipeTitles = new Map<string, number>();
  const recipeRefs = new Set<string>();
  const slotMap = new Map(slots.map((slot) => [normalizeKey(slot.name), slot]));
  const weekStart = parseISODate(doc.weekOf!);
  const weekEnd = dateKey(addDays(weekStart, 6));

  normalizedRecipes.forEach((recipe, index) => {
    if (!recipe.title) errors.push(`recipes[${index}].title is required.`);
    const titleKey = normalizeKey(recipe.title);
    recipeTitles.set(titleKey, (recipeTitles.get(titleKey) ?? 0) + 1);
    if (!recipe.ingredients.length) errors.push(`recipes[${index}] must include at least one ingredient.`);
    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      if (!ingredient.itemName) {
        errors.push(`recipes[${index}].ingredients[${ingredientIndex}].itemName is required.`);
      }
      if (!(ingredient.quantity > 0)) {
        errors.push(`recipes[${index}].ingredients[${ingredientIndex}].quantity must be greater than 0.`);
      }
    });
  });

  for (const [title, count] of recipeTitles.entries()) {
    if (count > 1) errors.push(`Recipe titles must be unique. Duplicate title: "${title}".`);
  }

  normalizedMeals.forEach((meal, index) => {
    if (!isValidIsoDate(meal.date)) errors.push(`plannedMeals[${index}].date must be a valid YYYY-MM-DD date.`);
    if (isValidIsoDate(meal.date) && (meal.date < doc.weekOf! || meal.date > weekEnd)) {
      errors.push(`plannedMeals[${index}].date must fall within the week starting ${doc.weekOf}.`);
    }
    if (!slotMap.has(normalizeKey(meal.mealSlotName))) {
      errors.push(`plannedMeals[${index}].mealSlotName does not match an existing meal slot.`);
    }
    if (meal.ref) {
      if (recipeRefs.has(meal.ref)) errors.push(`plannedMeals[${index}].ref must be unique. Duplicate ref: "${meal.ref}".`);
      recipeRefs.add(meal.ref);
    }
    if (meal.type === "recipe" && !meal.recipeRef) {
      errors.push(`plannedMeals[${index}] recipe meals require recipeRef.`);
    }
    if (meal.type === "freeform" && !meal.freeformTitle) {
      errors.push(`plannedMeals[${index}] freeform meals require freeformTitle.`);
    }
  });

  const recipeRefKeys = new Set<string>();
  normalizedRecipes.forEach((recipe) => {
    recipeRefKeys.add(normalizeKey(recipe.title));
    if (recipe.id) recipeRefKeys.add(normalizeKey(recipe.id));
  });

  normalizedMeals.forEach((meal, index) => {
    if (meal.type === "recipe" && meal.recipeRef && !recipeRefKeys.has(normalizeKey(meal.recipeRef))) {
      errors.push(`plannedMeals[${index}].recipeRef must match a recipe title or id in the AI file.`);
    }
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    slotMap,
    document: {
      version: 1,
      weekOf: doc.weekOf!,
      recipes: normalizedRecipes,
      plannedMeals: normalizedMeals
    }
  };
}

async function ensurePantryItem(
  ingredientName: string,
  unit: BaseUnit,
  pantryItems: PantryItem[],
  pantryByName: Map<string, PantryItem>
) {
  const key = normalizeKey(ingredientName);
  const existing = pantryByName.get(key);
  if (existing) return existing;
  const created = await createPantryItem({
    name: ingredientName,
    category: "other",
    storageType: "pantry",
    baseUnit: unit,
    notes: undefined
  });
  pantryItems.push(created);
  pantryByName.set(key, created);
  return created;
}

async function upsertAiRecipes(recipesFromAi: AiWeekRecipe[]) {
  const existingRecipes = await listRecipes();
  const existingByTitle = new Map(existingRecipes.map((recipe) => [normalizeKey(recipe.title), recipe]));
  const existingById = new Map(existingRecipes.map((recipe) => [normalizeKey(recipe.id), recipe]));
  const pantryItems = await listPantryItems();
  const pantryByName = new Map(pantryItems.map((item) => [normalizeKey(item.name), item]));
  const recipeResolution = new Map<string, Recipe>();
  let recipesCreated = 0;
  let recipesReused = 0;

  for (const recipeInput of recipesFromAi) {
    const byTitle = existingByTitle.get(normalizeKey(recipeInput.title));
    const byId = recipeInput.id ? existingById.get(normalizeKey(recipeInput.id)) : undefined;
    const existing = byTitle || byId;
    if (existing) {
      recipeResolution.set(normalizeKey(recipeInput.title), existing);
      if (recipeInput.id) recipeResolution.set(normalizeKey(recipeInput.id), existing);
      recipesReused += 1;
      continue;
    }

    const createdRecipe = await createRecipe({
      title: recipeInput.title,
      notes: recipeInput.notes,
      baseServings: recipeInput.baseServings ?? 2,
      defaultServings: recipeInput.defaultServings ?? recipeInput.baseServings ?? 2,
      mealTypes: recipeInput.mealTypes || [],
      tags: [],
      steps: recipeInput.instructions || [],
      url: undefined,
      calories: undefined,
      caloriesPerServing: undefined,
      proteinGrams: undefined,
      timeMinutes: undefined,
      estimatedCostPerServing: undefined,
      imageUrl: undefined
    });
    existingByTitle.set(normalizeKey(createdRecipe.title), createdRecipe);
    existingById.set(normalizeKey(createdRecipe.id), createdRecipe);
    recipeResolution.set(normalizeKey(recipeInput.title), createdRecipe);
    if (recipeInput.id) recipeResolution.set(normalizeKey(recipeInput.id), createdRecipe);
    recipesCreated += 1;

    for (const ingredient of recipeInput.ingredients) {
      const pantryItem = await ensurePantryItem(ingredient.itemName, ingredient.unit, pantryItems, pantryByName);
      await addIngredient({
        recipeId: createdRecipe.id,
        pantryItemId: pantryItem.id,
        quantity: ingredient.quantity,
        prepNote: ingredient.notes,
        altGroup: undefined
      });
    }
  }

  return { recipeResolution, recipesCreated, recipesReused };
}

function sortMealsForImport(meals: AiWeekPlannedMeal[], slotMap: Map<string, MealSlot>) {
  return [...meals].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const slotA = slotMap.get(normalizeKey(a.mealSlotName))?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const slotB = slotMap.get(normalizeKey(b.mealSlotName))?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return slotA - slotB;
  });
}

function buildDowngradedLeftoverTitle(meal: AiWeekPlannedMeal) {
  return meal.freeformTitle || `Leftover placeholder${meal.leftoverSourceRef ? ` (${meal.leftoverSourceRef})` : ""}`;
}

export async function importAiWeekPlan(raw: string): Promise<AiImportSummary> {
  const slots = await listMealSlots();
  const validation = parseAndValidateAiWeekPlan(raw, slots);
  if (!validation.ok) {
    throw new Error(formatValidationError(validation.errors));
  }

  const { document, slotMap } = validation;
  const householdSize = getHouseholdSize();
  const importedDates = Array.from(new Set(document.plannedMeals.map((meal) => meal.date))).sort();
  const minDate = importedDates[0];
  const maxDate = importedDates[importedDates.length - 1];
  const allMeals = await listPlannedMeals("0000-01-01", "9999-12-31");
  const mealsToReplace = allMeals.filter((meal) => importedDates.includes(meal.date));
  const mealsToReplaceIds = new Set(mealsToReplace.map((meal) => meal.id));
  const blockingExternalReferences = allMeals.filter(
    (meal) =>
      meal.type === "leftover" &&
      !importedDates.includes(meal.date) &&
      mealsToReplaceIds.has(meal.leftoverSourceMealId || meal.sourcePlannedMealId || "")
  );
  if (blockingExternalReferences.length) {
    throw new Error(
      "AI import would replace meals that are still used by leftovers outside the imported dates. Remove those leftovers first or import a different date range."
    );
  }

  const { recipeResolution, recipesCreated, recipesReused } = await upsertAiRecipes(document.recipes);

  let currentMeals = allMeals.filter((meal) => !importedDates.includes(meal.date));
  const mealsToDelete = [...mealsToReplace].sort((a, b) => {
    if (a.type === b.type) return a.date.localeCompare(b.date);
    if (a.type === "leftover") return -1;
    if (b.type === "leftover") return 1;
    return a.date.localeCompare(b.date);
  });
  for (const meal of mealsToDelete) {
    await deleteMealWithRules({
      meal,
      householdSize,
      currentMeals: [...currentMeals, ...mealsToDelete]
    });
  }

  const localRefMap = new Map<string, PlannedMeal>();
  let plannedMealsCreated = 0;
  let leftoverDowngradedToFreeform = 0;

  for (const mealInput of sortMealsForImport(document.plannedMeals, slotMap)) {
    const slot = slotMap.get(normalizeKey(mealInput.mealSlotName));
    if (!slot) continue;

    if (mealInput.type === "recipe") {
      const recipe = recipeResolution.get(normalizeKey(mealInput.recipeRef));
      if (!recipe) {
        throw new Error(`Recipe reference "${mealInput.recipeRef}" could not be resolved during import.`);
      }
      const result = await createMealWithRules({
        input: buildRecipeMealInput({
          date: mealInput.date,
          mealSlotId: slot.id,
          recipe,
          servingsPlanned: mealInput.servingsPlanned,
          householdSize,
          notes: mealInput.notes
        }),
        householdSize,
        currentMeals
      });
      if (result.created) {
        plannedMealsCreated += 1;
        currentMeals = [...currentMeals, result.created];
        if (mealInput.ref) localRefMap.set(mealInput.ref, result.created);
      }
      continue;
    }

    if (mealInput.type === "leftover") {
      const sourceMeal = mealInput.leftoverSourceRef ? localRefMap.get(mealInput.leftoverSourceRef) : undefined;
      if (sourceMeal) {
        const result = await createMealWithRules({
          input: buildLeftoverMealInput({
            date: mealInput.date,
            mealSlotId: slot.id,
            sourceMeal,
            servingsUsed: mealInput.servingsPlanned,
            notes: mealInput.notes,
            freeformTitle: mealInput.freeformTitle
          }),
          householdSize,
          currentMeals
        });
        if (result.created) {
          plannedMealsCreated += 1;
          currentMeals = currentMeals
            .map((meal) =>
              result.sourceUpdate && meal.id === result.sourceUpdate.mealId
                ? { ...meal, leftoverServingsRemaining: result.sourceUpdate.leftoverServingsRemaining }
                : meal
            );
          currentMeals = [...currentMeals, result.created];
          if (mealInput.ref) localRefMap.set(mealInput.ref, result.created);
        }
      } else {
        const downgraded = await createMealWithRules({
          input: buildFreeformMealInput({
            date: mealInput.date,
            mealSlotId: slot.id,
            freeformTitle: buildDowngradedLeftoverTitle(mealInput),
            notes: [mealInput.notes, mealInput.leftoverSourceRef ? `AI import note: unresolved leftoverSourceRef "${mealInput.leftoverSourceRef}".` : "AI import note: leftover source was not provided."]
              .filter(Boolean)
              .join(" ")
          }),
          householdSize,
          currentMeals
        });
        if (downgraded.created) {
          leftoverDowngradedToFreeform += 1;
          plannedMealsCreated += 1;
          currentMeals = [...currentMeals, downgraded.created];
          if (mealInput.ref) localRefMap.set(mealInput.ref, downgraded.created);
        }
      }
      continue;
    }

    const freeform = await createMealWithRules({
      input: buildFreeformMealInput({
        date: mealInput.date,
        mealSlotId: slot.id,
        freeformTitle: mealInput.freeformTitle || "Freeform",
        notes: mealInput.notes
      }),
      householdSize,
      currentMeals
    });
    if (freeform.created) {
      plannedMealsCreated += 1;
      currentMeals = [...currentMeals, freeform.created];
      if (mealInput.ref) localRefMap.set(mealInput.ref, freeform.created);
    }
  }

  return {
    recipesCreated,
    recipesReused,
    plannedMealsCreated,
    leftoverDowngradedToFreeform,
    replacedDates: importedDates
  };
}
