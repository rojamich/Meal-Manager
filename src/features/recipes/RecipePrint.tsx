import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PantryItem, Recipe, RecipeIngredient } from "../../models";
import { getRecipe, listIngredients } from "../../db/repositories/recipeRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { reportLoadError } from "../../utils/loadError";

export default function RecipePrint() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  useEffect(() => {
    if (!id) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    getRecipe(id)
      .then((value) => {
        if (cancelled) return;
        setRecipe(value ?? null);
        setStatus(value ? "ready" : "missing");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("missing");
        reportLoadError("this recipe")(err);
      });
    listIngredients(id).then(setIngredients).catch(reportLoadError("ingredients"));
    listPantryItems().then(setPantryItems).catch(reportLoadError("pantry items"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "missing") {
    return (
      <div className="panel">
        <h2>Recipe not found</h2>
        <p className="muted">It may have been deleted, or the link may be out of date.</p>
        <Link className="tag" to="/recipes">
          Back to recipes
        </Link>
      </div>
    );
  }

  if (!recipe) return <p className="muted">Loading recipe…</p>;

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
