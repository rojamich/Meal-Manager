import { AiWeekPlanDocument } from "./aiImportTypes";
import { dateKey } from "../../utils/date";

export function createAiWeekTemplate(weekOf = dateKey(new Date())): AiWeekPlanDocument {
  return {
    version: 1,
    weekOf,
    recipes: [
      {
        id: "chicken-rice-bowl",
        title: "Chicken Rice Bowl",
        notes: "Replace placeholder text with actual recipe notes.",
        baseServings: 2,
        defaultServings: 2,
        mealTypes: ["lunch", "dinner"],
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
        ref: "mon-dinner-chicken-rice-bowl",
        date: weekOf,
        mealSlotName: "Dinner",
        type: "recipe",
        recipeRef: "Chicken Rice Bowl",
        servingsPlanned: 4,
        notes: "Example recipe meal"
      },
      {
        date: weekOf,
        mealSlotName: "Lunch",
        type: "leftover",
        leftoverSourceRef: "mon-dinner-chicken-rice-bowl",
        freeformTitle: "Chicken Rice Bowl leftovers",
        servingsPlanned: 2,
        notes: "Example leftover meal"
      },
      {
        date: weekOf,
        mealSlotName: "Snack",
        type: "freeform",
        freeformTitle: "Protein bar",
        servingsPlanned: 1,
        notes: "Example freeform meal"
      }
    ]
  };
}
