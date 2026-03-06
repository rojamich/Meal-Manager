import { AiWeekPlanDocument } from "./aiImportTypes";
import { addDays, dateKey, parseISODate } from "../../utils/date";

export function createAiWeekTemplate(weekOf = dateKey(new Date())): AiWeekPlanDocument {
  const startDate = weekOf;
  const endDate = dateKey(addDays(parseISODate(weekOf), 6));
  return {
    version: 1,
    weekOf,
    startDate,
    endDate,
    pantryItems: [
      {
        name: "Chicken thigh",
        category: "Protein",
        storageType: "fridge",
        unit: "g",
        defaultShelfLifeDays: 3,
        afterOpeningDays: 2,
        notes: "Optional pantry defaults used when the item does not already exist."
      },
      {
        name: "Rice",
        category: "Grains",
        storageType: "pantry",
        unit: "g",
        defaultShelfLifeDays: 180,
        afterOpeningDays: 30,
        notes: "weekOf is the reference date. startDate/endDate control which planner dates are allowed."
      }
    ],
    recipes: [
      {
        id: "berry-yogurt-parfait",
        title: "Berry Yogurt Parfait",
        notes: "Example breakfast recipe metadata.",
        baseServings: 1,
        defaultServings: 1,
        mealTypes: ["breakfast"],
        tags: ["quick", "high-protein"],
        caloriesPerServing: 320,
        proteinGramsPerServing: 18,
        timeMinutes: 5,
        estimatedCostPerServing: 2.5,
        imageUrl: "https://example.com/parfait.jpg",
        ingredients: [
          {
            itemName: "Greek yogurt",
            quantity: 200,
            unit: "g",
            notes: "Plain"
          },
          {
            itemName: "Berries",
            quantity: 100,
            unit: "g",
            notes: "Fresh or frozen"
          }
        ],
        instructions: [
          "Spoon yogurt into a bowl.",
          "Top with berries."
        ]
      },
      {
        id: "chicken-rice-bowl",
        title: "Chicken Rice Bowl",
        notes: "Replace placeholder text with actual recipe notes.",
        baseServings: 2,
        defaultServings: 2,
        mealTypes: ["lunch", "dinner"],
        tags: ["meal-prep", "budget"],
        caloriesPerServing: 540,
        proteinGramsPerServing: 36,
        timeMinutes: 30,
        estimatedCostPerServing: 4.75,
        imageUrl: "https://example.com/chicken-rice-bowl.jpg",
        ingredients: [
          {
            itemName: "Chicken thigh",
            quantity: 500,
            unit: "g",
            notes: "Boneless, skinless"
          },
          {
            itemName: "Rice",
            quantity: 250,
            unit: "g",
            notes: "Dry rice"
          }
        ],
        instructions: [
          "Replace this array with actual cooking steps.",
          "Each entry should be a single step string."
        ]
      }
    ],
    plannedMeals: [
      {
        ref: "mon-breakfast-parfait",
        date: startDate,
        mealSlotName: "Breakfast",
        type: "recipe",
        recipeRef: "Berry Yogurt Parfait",
        servingsPlanned: 1,
        notes: "Example breakfast placement"
      },
      {
        ref: "mon-lunch-chicken-rice-bowl",
        date: startDate,
        mealSlotName: "Lunch",
        type: "recipe",
        recipeRef: "Chicken Rice Bowl",
        servingsPlanned: 2,
        notes: "Example lunch placement"
      },
      {
        ref: "mon-dinner-chicken-rice-bowl",
        date: startDate,
        mealSlotName: "Dinner",
        type: "recipe",
        recipeRef: "Chicken Rice Bowl",
        servingsPlanned: 4,
        notes: "Example recipe meal"
      },
      {
        date: startDate,
        mealSlotName: "Lunch",
        type: "leftover",
        leftoverSourceRef: "mon-dinner-chicken-rice-bowl",
        freeformTitle: "Chicken Rice Bowl leftovers",
        servingsPlanned: 2,
        notes: "Example leftover meal"
      },
      {
        ref: "mon-snack-protein-bar",
        date: startDate,
        mealSlotName: "Snack",
        type: "freeform",
        freeformTitle: "Protein bar",
        servingsPlanned: 1,
        notes: "Example snack placement"
      }
    ]
  };
}
