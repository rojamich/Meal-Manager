import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PantryItem, Recipe, RecipeIngredient } from "../../models";
import { getRecipe, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";

export default function RecipePrint() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getRecipe(id).then((value) => value && setRecipe(value));
    listIngredients(id).then(setIngredients);
    listPantryItems().then(setPantryItems);
  }, [id]);

  if (!recipe) return <p>Loading...</p>;

  return (
    <div className="panel">
      <h1>{recipe.title}</h1>
      {recipe.notes && <p>{recipe.notes}</p>}
      <h3>Ingredients</h3>
      <ul>
        {ingredients.map((ing) => (
          <li key={ing.id}>
            {pantryItems.find((p) => p.id === ing.pantryItemId)?.name} - {ing.quantity}{" "}
            {pantryItems.find((p) => p.id === ing.pantryItemId)?.baseUnit}
            {ing.prepNote ? ` (${ing.prepNote})` : ""}
          </li>
        ))}
      </ul>
      <h3>Steps</h3>
      <ol>
        {recipe.steps.map((step, idx) => (
          <li key={idx}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
