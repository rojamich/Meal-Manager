import { WeekTemplate, WeekTemplateDay } from "../models";

function freeform(mealSlotId: string, freeformTitle: string, servingsPlanned = 2) {
  return {
    mealSlotId,
    type: "freeform" as const,
    freeformTitle,
    servingsPlanned
  };
}

function day(weekday: number, ...meals: WeekTemplateDay["meals"]): WeekTemplateDay {
  return { weekday, meals };
}

export const STARTER_WEEK_TEMPLATES: Omit<WeekTemplate, "id" | "createdAt">[] = [
  {
    schemaVersion: 1,
    name: "Quick Week",
    days: [
      day(0, freeform("breakfast", "Yogurt + granola"), freeform("lunch", "Sandwich"), freeform("dinner", "Pasta + jarred sauce")),
      day(1, freeform("breakfast", "Eggs + toast"), freeform("lunch", "Leftovers"), freeform("dinner", "Tacos")),
      day(2, freeform("breakfast", "Cereal"), freeform("lunch", "Big salad"), freeform("dinner", "Stir fry + rice")),
      day(3, freeform("breakfast", "Smoothie"), freeform("lunch", "Soup + bread"), freeform("dinner", "Burger night")),
      day(4, freeform("breakfast", "Eggs + toast"), freeform("lunch", "Sandwich"), freeform("dinner", "Pizza")),
      day(5, freeform("breakfast", "Pancakes"), freeform("lunch", "Out"), freeform("dinner", "Sheet pan chicken")),
      day(6, freeform("breakfast", "Yogurt + granola"), freeform("lunch", "Leftover chicken"), freeform("dinner", "One-pot pasta"))
    ]
  },
  {
    schemaVersion: 1,
    name: "Comfort Week",
    days: [
      day(0, freeform("breakfast", "Pancakes"), freeform("lunch", "Grilled cheese + tomato soup"), freeform("dinner", "Lasagna")),
      day(1, freeform("breakfast", "Bacon + eggs"), freeform("lunch", "Leftover lasagna"), freeform("dinner", "Chili")),
      day(2, freeform("breakfast", "Oatmeal"), freeform("lunch", "Chili dogs"), freeform("dinner", "Roast chicken + potatoes")),
      day(3, freeform("breakfast", "French toast"), freeform("lunch", "Chicken sandwich"), freeform("dinner", "Mac & cheese")),
      day(4, freeform("breakfast", "Breakfast burritos"), freeform("lunch", "Leftover mac"), freeform("dinner", "Pot roast")),
      day(5, freeform("breakfast", "Waffles"), freeform("lunch", "Out / takeout"), freeform("dinner", "Pizza night")),
      day(6, freeform("breakfast", "Eggs benedict"), freeform("lunch", "Soup"), freeform("dinner", "Pulled pork"))
    ]
  },
  {
    schemaVersion: 1,
    name: "Healthy Week",
    days: [
      day(0, freeform("breakfast", "Overnight oats"), freeform("lunch", "Grain bowl"), freeform("dinner", "Baked salmon + veg")),
      day(1, freeform("breakfast", "Smoothie"), freeform("lunch", "Salad"), freeform("dinner", "Chicken stir fry")),
      day(2, freeform("breakfast", "Greek yogurt + fruit"), freeform("lunch", "Lentil soup"), freeform("dinner", "Turkey chili")),
      day(3, freeform("breakfast", "Avocado toast"), freeform("lunch", "Wrap"), freeform("dinner", "Veggie pasta")),
      day(4, freeform("breakfast", "Oatmeal + berries"), freeform("lunch", "Big salad"), freeform("dinner", "Sheet pan fish")),
      day(5, freeform("breakfast", "Eggs + greens"), freeform("lunch", "Hummus + veg"), freeform("dinner", "Grilled chicken + quinoa")),
      day(6, freeform("breakfast", "Pancakes (cheat day)"), freeform("lunch", "Leftover chicken"), freeform("dinner", "Stir fry + rice"))
    ]
  }
];
