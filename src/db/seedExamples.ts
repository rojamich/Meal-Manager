import { db } from "./db";
import { BaseUnit, EssentialItem, PantryItem, Recipe, StorageType } from "../models";
import { newId } from "../utils/id";

/**
 * Idempotent seed of Mike + Jen's typical pantry items, essentials, and recipes.
 * Triggered manually from Settings ("Add example recipes & essentials"). Looks up
 * existing items by lowercase name so repeat clicks are safe.
 *
 * Recipes target ≤ 500 calories per serving without weird substitutions.
 */

interface PantrySpec {
  name: string;
  category: string;
  storageType: StorageType;
  baseUnit: BaseUnit;
  defaultShelfLifeDays?: number;
  defaultAfterOpeningDays?: number;
}

const PANTRY_ITEMS: PantrySpec[] = [
  { name: "Eggs", category: "dairy", storageType: "fridge", baseUnit: "count", defaultShelfLifeDays: 28, defaultAfterOpeningDays: 7 },
  { name: "Bread", category: "bakery", storageType: "pantry", baseUnit: "count", defaultShelfLifeDays: 7, defaultAfterOpeningDays: 5 },
  { name: "Rice", category: "pantry_dry", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 365, defaultAfterOpeningDays: 365 },
  { name: "Cilantro", category: "produce", storageType: "fridge", baseUnit: "g", defaultShelfLifeDays: 7, defaultAfterOpeningDays: 5 },
  { name: "Carrots", category: "produce", storageType: "fridge", baseUnit: "g", defaultShelfLifeDays: 30, defaultAfterOpeningDays: 14 },
  { name: "Spicy garlic chili sauce", category: "condiments", storageType: "fridge", baseUnit: "ml", defaultShelfLifeDays: 365, defaultAfterOpeningDays: 180 },
  { name: "Frozen breaded chicken", category: "protein_frozen", storageType: "freezer", baseUnit: "count", defaultShelfLifeDays: 180, defaultAfterOpeningDays: 30 },
  { name: "Hot sauce", category: "condiments", storageType: "pantry", baseUnit: "ml", defaultShelfLifeDays: 730, defaultAfterOpeningDays: 730 },
  { name: "Bell peppers", category: "produce", storageType: "fridge", baseUnit: "count", defaultShelfLifeDays: 7, defaultAfterOpeningDays: 5 },
  { name: "Onion", category: "produce", storageType: "pantry", baseUnit: "count", defaultShelfLifeDays: 30, defaultAfterOpeningDays: 7 },
  { name: "Garlic", category: "produce", storageType: "pantry", baseUnit: "count", defaultShelfLifeDays: 60, defaultAfterOpeningDays: 21 },
  { name: "Soy sauce", category: "condiments", storageType: "pantry", baseUnit: "ml", defaultShelfLifeDays: 730, defaultAfterOpeningDays: 365 },
  { name: "Olive oil", category: "pantry_dry", storageType: "pantry", baseUnit: "ml", defaultShelfLifeDays: 365, defaultAfterOpeningDays: 180 },
  { name: "Butter", category: "dairy", storageType: "fridge", baseUnit: "g", defaultShelfLifeDays: 60, defaultAfterOpeningDays: 21 },
  { name: "Spicy mayo", category: "condiments", storageType: "fridge", baseUnit: "ml", defaultShelfLifeDays: 90, defaultAfterOpeningDays: 60 },
  { name: "Garlic powder", category: "spices", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 730 },
  { name: "Paprika", category: "spices", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 730 },
  { name: "Onion powder", category: "spices", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 730 },
  { name: "Corn (canned)", category: "pantry_canned_jarred", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 730, defaultAfterOpeningDays: 5 },
  { name: "Bananas", category: "produce", storageType: "pantry", baseUnit: "count", defaultShelfLifeDays: 7 },
  { name: "Coffee", category: "pantry_dry", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 180, defaultAfterOpeningDays: 60 },
  { name: "Chicken thighs", category: "protein_fresh", storageType: "fridge", baseUnit: "g", defaultShelfLifeDays: 3, defaultAfterOpeningDays: 1 },
  { name: "Shrimp", category: "protein_fresh", storageType: "fridge", baseUnit: "g", defaultShelfLifeDays: 2, defaultAfterOpeningDays: 1 },
  { name: "Black beans (canned)", category: "pantry_canned_jarred", storageType: "pantry", baseUnit: "g", defaultShelfLifeDays: 730, defaultAfterOpeningDays: 5 },
  { name: "Tortillas", category: "bakery", storageType: "pantry", baseUnit: "count", defaultShelfLifeDays: 14, defaultAfterOpeningDays: 7 },
  { name: "Chicken stock", category: "pantry_canned_jarred", storageType: "pantry", baseUnit: "ml", defaultShelfLifeDays: 365, defaultAfterOpeningDays: 7 },
  { name: "Lime", category: "produce", storageType: "fridge", baseUnit: "count", defaultShelfLifeDays: 21, defaultAfterOpeningDays: 7 }
];

interface EssentialSpec {
  pantryItemName: string;
  defaultQty: number;
  alwaysInclude?: boolean;
  includeWhenPantryEmpty?: boolean;
  minStayDays?: number;
}

// Quantities are tuned for two people. minStayDays gates bulk items (rice, coffee)
// so short trips don't get a big bag.
const ESSENTIALS: EssentialSpec[] = [
  // Always-include perishables / week-by-week
  { pantryItemName: "Bananas", defaultQty: 6, alwaysInclude: true },
  { pantryItemName: "Bell peppers", defaultQty: 3, alwaysInclude: true },
  { pantryItemName: "Garlic", defaultQty: 6, alwaysInclude: true },
  { pantryItemName: "Onion", defaultQty: 3, alwaysInclude: true },
  // Bulk / shelf-stable — only when we're staying a while
  { pantryItemName: "Rice", defaultQty: 500, alwaysInclude: false, includeWhenPantryEmpty: true, minStayDays: 3 },
  { pantryItemName: "Rice", defaultQty: 2000, alwaysInclude: false, includeWhenPantryEmpty: true, minStayDays: 14 },
  { pantryItemName: "Coffee", defaultQty: 250, alwaysInclude: false, includeWhenPantryEmpty: true, minStayDays: 3 },
  { pantryItemName: "Coffee", defaultQty: 500, alwaysInclude: false, includeWhenPantryEmpty: true, minStayDays: 14 },
  // Pantry-empty essentials (condiments + spices)
  { pantryItemName: "Spicy mayo", defaultQty: 200, includeWhenPantryEmpty: true },
  { pantryItemName: "Garlic powder", defaultQty: 50, includeWhenPantryEmpty: true },
  { pantryItemName: "Paprika", defaultQty: 50, includeWhenPantryEmpty: true },
  { pantryItemName: "Onion powder", defaultQty: 50, includeWhenPantryEmpty: true },
  { pantryItemName: "Corn (canned)", defaultQty: 400, includeWhenPantryEmpty: true },
  { pantryItemName: "Olive oil", defaultQty: 500, includeWhenPantryEmpty: true },
  { pantryItemName: "Hot sauce", defaultQty: 150, includeWhenPantryEmpty: true },
  { pantryItemName: "Spicy garlic chili sauce", defaultQty: 200, includeWhenPantryEmpty: true },
  { pantryItemName: "Soy sauce", defaultQty: 200, includeWhenPantryEmpty: true }
];

interface RecipeSpec {
  title: string;
  baseServings: number;
  calories: number;
  proteinGrams?: number;
  timeMinutes: number;
  mealTypes: string[];
  tags: string[];
  notes?: string;
  steps: string[];
  ingredients: Array<{ pantryItemName: string; quantity: number; prepNote?: string }>;
}

const RECIPES: RecipeSpec[] = [
  {
    title: "Fried Eggs over Toast (Mike)",
    baseServings: 1,
    calories: 350,
    proteinGrams: 18,
    timeMinutes: 8,
    mealTypes: ["breakfast"],
    tags: ["quick", "eggs"],
    notes: "Mike's go-to. Hot sauce on top, runny yolks soak the toast.",
    steps: [
      "Toast 2 slices of bread.",
      "Heat a non-stick pan over medium with 1 tsp butter.",
      "Fry 2 eggs sunny-side-up, ~2 min.",
      "Slide eggs onto the toast. Salt + plenty of hot sauce.",
      "Serve."
    ],
    ingredients: [
      { pantryItemName: "Eggs", quantity: 2 },
      { pantryItemName: "Bread", quantity: 2, prepNote: "slices, toasted" },
      { pantryItemName: "Butter", quantity: 5 },
      { pantryItemName: "Hot sauce", quantity: 10 }
    ]
  },
  {
    title: "Fried Eggs over Rice + Carrots + Cilantro (Jen)",
    baseServings: 1,
    calories: 460,
    proteinGrams: 20,
    timeMinutes: 12,
    mealTypes: ["breakfast"],
    tags: ["quick", "eggs", "rice"],
    notes: "Jen's go-to. Spicy garlic chili sauce drizzle to finish.",
    steps: [
      "Warm 1 cup cooked rice (microwave 60s with a splash of water).",
      "Grate or julienne 50g carrots and roughly chop a small handful of cilantro.",
      "Heat 1 tsp oil in a small pan, fry 2 eggs sunny-side-up.",
      "Plate the rice, top with carrots, cilantro, then the eggs.",
      "Drizzle 1 tbsp spicy garlic chili sauce over the top."
    ],
    ingredients: [
      { pantryItemName: "Eggs", quantity: 2 },
      { pantryItemName: "Rice", quantity: 60, prepNote: "uncooked ≈ 1 cup cooked" },
      { pantryItemName: "Carrots", quantity: 50 },
      { pantryItemName: "Cilantro", quantity: 10 },
      { pantryItemName: "Spicy garlic chili sauce", quantity: 15 },
      { pantryItemName: "Olive oil", quantity: 5 }
    ]
  },
  {
    title: "Breaded Chicken over Rice (Lunch)",
    baseServings: 2,
    calories: 480,
    proteinGrams: 28,
    timeMinutes: 20,
    mealTypes: ["lunch"],
    tags: ["quick", "rice", "kid-easy"],
    notes: "Reheat the frozen breaded chicken in the oven or air fryer for best texture.",
    steps: [
      "Cook breaded chicken per package (typically 200°C / 400°F for 15 min).",
      "Meanwhile, warm 2 cups cooked rice.",
      "Plate rice, top with chicken, drizzle with spicy mayo.",
      "Optional: handful of cilantro and a squeeze of lime."
    ],
    ingredients: [
      { pantryItemName: "Frozen breaded chicken", quantity: 4, prepNote: "pieces" },
      { pantryItemName: "Rice", quantity: 120, prepNote: "uncooked ≈ 2 cups cooked" },
      { pantryItemName: "Spicy mayo", quantity: 30 },
      { pantryItemName: "Cilantro", quantity: 8 },
      { pantryItemName: "Lime", quantity: 0.5 }
    ]
  },
  {
    title: "Egg Fried Rice",
    baseServings: 2,
    calories: 440,
    proteinGrams: 18,
    timeMinutes: 15,
    mealTypes: ["lunch", "dinner"],
    tags: ["quick", "rice", "one-pan"],
    notes: "Day-old rice works best. The eggs go in first so they don't get rubbery.",
    steps: [
      "Heat 1 tbsp oil in a large pan over medium-high heat.",
      "Add diced onion and bell pepper. Cook 3 min until softening.",
      "Stir in minced garlic, cook 30 sec.",
      "Push veg to one side. Crack 2 eggs into the empty space and scramble.",
      "Add 2 cups cooked rice. Toss everything together.",
      "Add soy sauce + chili sauce. Toss to coat.",
      "Top with chopped cilantro and serve."
    ],
    ingredients: [
      { pantryItemName: "Eggs", quantity: 2 },
      { pantryItemName: "Rice", quantity: 120, prepNote: "uncooked ≈ 2 cups cooked" },
      { pantryItemName: "Onion", quantity: 1, prepNote: "small, diced" },
      { pantryItemName: "Bell peppers", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Garlic", quantity: 2, prepNote: "cloves, minced" },
      { pantryItemName: "Soy sauce", quantity: 30 },
      { pantryItemName: "Spicy garlic chili sauce", quantity: 15 },
      { pantryItemName: "Cilantro", quantity: 10 },
      { pantryItemName: "Olive oil", quantity: 15 }
    ]
  },
  {
    title: "Sheet-Pan Paprika Chicken & Peppers",
    baseServings: 2,
    calories: 450,
    proteinGrams: 36,
    timeMinutes: 40,
    mealTypes: ["dinner"],
    tags: ["sheet-pan", "chicken"],
    notes: "Lots of paprika is the move. Saves leftovers for a second meal.",
    steps: [
      "Preheat oven to 220°C / 425°F.",
      "Toss 280g chicken thighs, 2 bell peppers (sliced), and 1 onion (wedges) with 1 tbsp olive oil.",
      "Season with 1 tsp paprika, 1 tsp garlic powder, 1 tsp onion powder, salt.",
      "Spread on a sheet pan. Roast 30 min, flipping once.",
      "Serve as-is or over rice. Drizzle with spicy mayo."
    ],
    ingredients: [
      { pantryItemName: "Chicken thighs", quantity: 280, prepNote: "boneless skinless" },
      { pantryItemName: "Bell peppers", quantity: 2, prepNote: "sliced" },
      { pantryItemName: "Onion", quantity: 1, prepNote: "wedges" },
      { pantryItemName: "Olive oil", quantity: 15 },
      { pantryItemName: "Paprika", quantity: 4 },
      { pantryItemName: "Garlic powder", quantity: 4 },
      { pantryItemName: "Onion powder", quantity: 4 },
      { pantryItemName: "Spicy mayo", quantity: 20 }
    ]
  },
  {
    title: "Garlic Shrimp over Rice",
    baseServings: 2,
    calories: 420,
    proteinGrams: 28,
    timeMinutes: 15,
    mealTypes: ["dinner"],
    tags: ["quick", "rice", "shrimp"],
    notes: "Don't skimp on garlic. Add chili sauce at the end so it stays bright.",
    steps: [
      "Have 2 cups cooked rice ready (use leftover or microwave-warm a portion).",
      "Heat 1 tbsp butter in a pan over medium-high.",
      "Add 6 minced garlic cloves, cook 30 sec until fragrant.",
      "Add 250g shrimp. Cook 2-3 min until pink, flipping once.",
      "Stir in 1 tsp paprika and 1 tbsp chili sauce. Toss.",
      "Serve over rice. Cilantro and lime to finish."
    ],
    ingredients: [
      { pantryItemName: "Shrimp", quantity: 250, prepNote: "peeled, deveined" },
      { pantryItemName: "Rice", quantity: 120, prepNote: "uncooked ≈ 2 cups cooked" },
      { pantryItemName: "Garlic", quantity: 6, prepNote: "cloves, minced" },
      { pantryItemName: "Butter", quantity: 15 },
      { pantryItemName: "Paprika", quantity: 2 },
      { pantryItemName: "Spicy garlic chili sauce", quantity: 15 },
      { pantryItemName: "Cilantro", quantity: 8 },
      { pantryItemName: "Lime", quantity: 0.5 }
    ]
  },
  {
    title: "Spicy Garlic Chicken over Rice",
    baseServings: 2,
    calories: 470,
    proteinGrams: 32,
    timeMinutes: 20,
    mealTypes: ["dinner"],
    tags: ["quick", "rice", "chicken"],
    notes: "Thai basil chicken style but uses cilantro since we keep it on hand. Egg on top is non-negotiable.",
    steps: [
      "Dice 250g chicken thighs.",
      "Heat 1 tbsp oil in a large pan over high heat. Add 4 minced garlic cloves, cook 20 sec.",
      "Add chicken, stir-fry 4 min until browned.",
      "Add 2 tbsp soy sauce and 1 tbsp chili sauce. Toss 1 min.",
      "Off heat, stir in a handful of cilantro.",
      "Serve over 2 cups warm rice with a fried egg on top of each plate."
    ],
    ingredients: [
      { pantryItemName: "Chicken thighs", quantity: 250, prepNote: "boneless, diced" },
      { pantryItemName: "Eggs", quantity: 2 },
      { pantryItemName: "Rice", quantity: 120, prepNote: "uncooked ≈ 2 cups cooked" },
      { pantryItemName: "Garlic", quantity: 4, prepNote: "cloves, minced" },
      { pantryItemName: "Soy sauce", quantity: 30 },
      { pantryItemName: "Spicy garlic chili sauce", quantity: 15 },
      { pantryItemName: "Cilantro", quantity: 12 },
      { pantryItemName: "Olive oil", quantity: 15 }
    ]
  },
  {
    title: "Loaded Scrambled Eggs",
    baseServings: 2,
    calories: 320,
    proteinGrams: 22,
    timeMinutes: 12,
    mealTypes: ["breakfast", "dinner"],
    tags: ["quick", "eggs"],
    notes: "Eggs into the cold pan + low heat = silky. Don't rush them.",
    steps: [
      "Dice 1 small onion and 1 bell pepper.",
      "Melt 1 tbsp butter in a pan over medium. Sweat the veg 4 min.",
      "Add 1 minced garlic clove, cook 30 sec.",
      "Crack 4 eggs into the pan, season with salt, and stir gently with a spatula on low heat until just set.",
      "Top with cilantro and hot sauce. Serve with toast."
    ],
    ingredients: [
      { pantryItemName: "Eggs", quantity: 4 },
      { pantryItemName: "Bread", quantity: 2, prepNote: "slices, toasted" },
      { pantryItemName: "Onion", quantity: 1, prepNote: "small, diced" },
      { pantryItemName: "Bell peppers", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Garlic", quantity: 1, prepNote: "minced" },
      { pantryItemName: "Butter", quantity: 15 },
      { pantryItemName: "Hot sauce", quantity: 10 },
      { pantryItemName: "Cilantro", quantity: 8 }
    ]
  },
  {
    title: "Black Bean & Corn Bowls",
    baseServings: 2,
    calories: 470,
    proteinGrams: 17,
    timeMinutes: 20,
    mealTypes: ["lunch", "dinner"],
    tags: ["vegetarian", "rice", "pantry-meal"],
    notes: "Pantry-meal night. Spicy mayo drizzle ties it together.",
    steps: [
      "Heat 1 tsp oil in a pan, add diced onion + bell pepper. Cook 4 min.",
      "Add 1 minced garlic clove, 1 tsp paprika, 1 tsp garlic powder. Stir 30 sec.",
      "Add 1 can drained black beans and 1 can drained corn. Warm 3-4 min.",
      "Plate over 1.5 cups warm rice. Drizzle with spicy mayo.",
      "Top with cilantro and lime."
    ],
    ingredients: [
      { pantryItemName: "Black beans (canned)", quantity: 400 },
      { pantryItemName: "Corn (canned)", quantity: 400 },
      { pantryItemName: "Rice", quantity: 90, prepNote: "uncooked ≈ 1.5 cups cooked" },
      { pantryItemName: "Onion", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Bell peppers", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Garlic", quantity: 1, prepNote: "minced" },
      { pantryItemName: "Olive oil", quantity: 5 },
      { pantryItemName: "Paprika", quantity: 2 },
      { pantryItemName: "Garlic powder", quantity: 2 },
      { pantryItemName: "Spicy mayo", quantity: 30 },
      { pantryItemName: "Cilantro", quantity: 10 },
      { pantryItemName: "Lime", quantity: 0.5 }
    ]
  },
  {
    title: "One-Pot Chicken & Rice",
    baseServings: 4,
    calories: 460,
    proteinGrams: 30,
    timeMinutes: 40,
    mealTypes: ["dinner"],
    tags: ["one-pot", "chicken", "rice", "leftovers"],
    notes: "Designed to make 4 servings — 2 tonight, 2 for tomorrow's lunch. The leftover rice gets even better.",
    steps: [
      "Heat 1 tbsp oil in a wide pot over medium-high.",
      "Season 500g chicken thighs with paprika, garlic powder, onion powder, salt. Sear 3 min per side. Remove.",
      "Add diced onion + bell pepper, cook 4 min.",
      "Add 3 minced garlic cloves, cook 30 sec.",
      "Stir in 1.5 cups (300g) rice. Toast 1 min.",
      "Add 600ml chicken stock. Nestle the chicken back in. Cover.",
      "Simmer on low for 22 min, undisturbed. Rest off heat 5 min.",
      "Top with cilantro."
    ],
    ingredients: [
      { pantryItemName: "Chicken thighs", quantity: 500, prepNote: "bone-in or boneless" },
      { pantryItemName: "Rice", quantity: 300, prepNote: "uncooked" },
      { pantryItemName: "Chicken stock", quantity: 600 },
      { pantryItemName: "Onion", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Bell peppers", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Garlic", quantity: 3, prepNote: "cloves, minced" },
      { pantryItemName: "Olive oil", quantity: 15 },
      { pantryItemName: "Paprika", quantity: 4 },
      { pantryItemName: "Garlic powder", quantity: 4 },
      { pantryItemName: "Onion powder", quantity: 4 },
      { pantryItemName: "Cilantro", quantity: 10 }
    ]
  },
  {
    title: "Egg Tacos",
    baseServings: 2,
    calories: 410,
    proteinGrams: 20,
    timeMinutes: 12,
    mealTypes: ["breakfast", "lunch"],
    tags: ["quick", "eggs"],
    notes: "Warm the tortillas right on the burner for 10 sec a side — game-changer.",
    steps: [
      "Warm 4 tortillas one at a time directly over a flame or in a dry pan.",
      "Heat 1 tsp oil in a pan, add diced bell pepper + onion. Cook 3 min.",
      "Add 1 minced garlic clove, cook 30 sec.",
      "Scramble 4 eggs into the pan with salt.",
      "Spoon into tortillas. Drizzle spicy mayo. Top with cilantro and a squeeze of lime."
    ],
    ingredients: [
      { pantryItemName: "Eggs", quantity: 4 },
      { pantryItemName: "Tortillas", quantity: 4 },
      { pantryItemName: "Bell peppers", quantity: 1, prepNote: "diced" },
      { pantryItemName: "Onion", quantity: 1, prepNote: "small, diced" },
      { pantryItemName: "Garlic", quantity: 1, prepNote: "minced" },
      { pantryItemName: "Olive oil", quantity: 5 },
      { pantryItemName: "Spicy mayo", quantity: 30 },
      { pantryItemName: "Cilantro", quantity: 10 },
      { pantryItemName: "Lime", quantity: 0.5 }
    ]
  }
];

async function ensurePantryItem(spec: PantrySpec, now: string): Promise<string> {
  const existing = (await db.pantryItems.toArray()).find(
    (item) => item.name.trim().toLowerCase() === spec.name.toLowerCase()
  );
  if (existing) return existing.id;
  const item: PantryItem = {
    id: newId(),
    name: spec.name,
    category: spec.category,
    storageType: spec.storageType,
    baseUnit: spec.baseUnit,
    defaultShelfLifeDays: spec.defaultShelfLifeDays,
    defaultAfterOpeningDays: spec.defaultAfterOpeningDays,
    createdAt: now,
    updatedAt: now
  };
  await db.pantryItems.add(item);
  return item.id;
}

async function ensureEssential(
  spec: EssentialSpec,
  pantryIdByName: Map<string, string>,
  now: string
): Promise<void> {
  const pantryItemId = pantryIdByName.get(spec.pantryItemName.toLowerCase());
  if (!pantryItemId) return;
  const all = await db.essentialItems.toArray();
  const existing = all.find(
    (item) =>
      item.pantryItemId === pantryItemId &&
      (item.minStayDays || 0) === (spec.minStayDays || 0) &&
      (item.defaultQty || 0) === spec.defaultQty
  );
  if (existing) return;
  const essential: EssentialItem = {
    id: newId(),
    pantryItemId,
    defaultQty: spec.defaultQty,
    alwaysInclude: Boolean(spec.alwaysInclude),
    includeWhenPantryEmpty: Boolean(spec.includeWhenPantryEmpty),
    minStayDays: spec.minStayDays,
    createdAt: now,
    updatedAt: now
  };
  await db.essentialItems.add(essential);
}

async function ensureRecipe(
  spec: RecipeSpec,
  pantryIdByName: Map<string, string>,
  now: string
): Promise<void> {
  const existing = (await db.recipes.toArray()).find(
    (recipe) => recipe.title?.trim().toLowerCase() === spec.title.toLowerCase()
  );
  if (existing) return; // do not duplicate

  const recipe: Recipe = {
    id: newId(),
    title: spec.title,
    baseServings: spec.baseServings,
    defaultServings: spec.baseServings,
    mealTypes: spec.mealTypes,
    tags: spec.tags,
    notes: spec.notes,
    steps: spec.steps,
    calories: spec.calories,
    caloriesPerServing: spec.calories,
    proteinGrams: spec.proteinGrams,
    timeMinutes: spec.timeMinutes,
    createdAt: now,
    updatedAt: now
  };
  await db.recipes.add(recipe);

  for (const ing of spec.ingredients) {
    const pantryItemId = pantryIdByName.get(ing.pantryItemName.toLowerCase());
    if (!pantryItemId) continue;
    await db.recipeIngredients.add({
      id: newId(),
      recipeId: recipe.id,
      pantryItemId,
      quantity: ing.quantity,
      prepNote: ing.prepNote,
      createdAt: now,
      updatedAt: now
    });
  }
}

export interface SeedSummary {
  pantryItemsCreated: number;
  pantryItemsExisting: number;
  recipesCreated: number;
  recipesExisting: number;
  essentialsCreated: number;
}

export async function seedExampleData(): Promise<SeedSummary> {
  const now = new Date().toISOString();
  const summary: SeedSummary = {
    pantryItemsCreated: 0,
    pantryItemsExisting: 0,
    recipesCreated: 0,
    recipesExisting: 0,
    essentialsCreated: 0
  };

  const existingPantryCount = (await db.pantryItems.toArray()).length;
  const pantryIdByName = new Map<string, string>();

  for (const spec of PANTRY_ITEMS) {
    const id = await ensurePantryItem(spec, now);
    pantryIdByName.set(spec.name.toLowerCase(), id);
  }
  const finalPantryCount = (await db.pantryItems.toArray()).length;
  summary.pantryItemsCreated = Math.max(finalPantryCount - existingPantryCount, 0);
  summary.pantryItemsExisting = Math.max(
    PANTRY_ITEMS.length - summary.pantryItemsCreated,
    0
  );

  const existingEssentials = (await db.essentialItems.toArray()).length;
  for (const spec of ESSENTIALS) {
    await ensureEssential(spec, pantryIdByName, now);
  }
  const finalEssentials = (await db.essentialItems.toArray()).length;
  summary.essentialsCreated = Math.max(finalEssentials - existingEssentials, 0);

  const existingRecipeCount = (await db.recipes.toArray()).length;
  for (const spec of RECIPES) {
    await ensureRecipe(spec, pantryIdByName, now);
  }
  const finalRecipeCount = (await db.recipes.toArray()).length;
  summary.recipesCreated = Math.max(finalRecipeCount - existingRecipeCount, 0);
  summary.recipesExisting = Math.max(RECIPES.length - summary.recipesCreated, 0);

  return summary;
}
