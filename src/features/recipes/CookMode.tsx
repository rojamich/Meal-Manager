import { useState } from "react";
import { PantryItem, RecipeIngredient } from "../../models";

export default function CookMode({
  steps,
  ingredients,
  pantryItems
}: {
  steps: string[];
  ingredients: RecipeIngredient[];
  pantryItems: PantryItem[];
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index] || "";

  return (
    <div className="panel">
      <h3>Cook Mode</h3>
      <div className="panel">
        <strong>Ingredients</strong>
        <ul>
          {ingredients.map((ing) => {
            const item = pantryItems.find((p) => p.id === ing.pantryItemId);
            if (!item) return null;
            return (
              <li key={ing.id}>
                {item.name} - {ing.quantity} {item.baseUnit}
                {ing.prepNote ? ` (${ing.prepNote})` : ""}
              </li>
            );
          })}
        </ul>
      </div>
      <p>{step}</p>
      <div className="row resource-toolbar">
        <button className="secondary" onClick={() => setIndex(Math.max(index - 1, 0))}>
          Prev
        </button>
        <button onClick={() => setIndex(Math.min(index + 1, steps.length - 1))}>Next</button>
      </div>
      <p>
        {index + 1} / {steps.length}
      </p>
    </div>
  );
}
