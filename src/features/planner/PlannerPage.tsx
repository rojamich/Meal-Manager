import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { MealSlot, PlannedMeal, Recipe } from "../../models";
import { listMealSlots, listPlannedMeals, createPlannedMeal, deletePlannedMeal } from "../../db/repositories/mealPlanRepo";
import { listRecipes } from "../../db/repositories/recipeRepo";
import { formatDateLabel, parseISODate, startOfWeek, toISODate, addDays } from "../../utils/date";

export default function PlannerPage() {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(toISODate(new Date()));
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    listMealSlots().then(setSlots);
    listRecipes().then(setRecipes);
  }, []);

  const refreshMeals = useCallback(async () => {
    const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
    const data = await listPlannedMeals(range.start, range.end);
    setMeals([...data]);
    return data;
  }, [anchorDate, view]);

  useEffect(() => {
    refreshMeals();
  }, [refreshMeals]);

  async function addMeal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const type = String(form.get("type")) as PlannedMeal["type"];
    const payload: Omit<PlannedMeal, "id" | "createdAt" | "updatedAt"> = {
      date: String(form.get("date")),
      mealSlotId: String(form.get("mealSlotId")),
      type,
      recipeId: type === "recipe" ? String(form.get("recipeId")) : undefined,
      freeformTitle: type === "freeform" ? String(form.get("freeformTitle")) : undefined,
      notes: String(form.get("notes") || "") || undefined,
      servingsPlanned: type === "recipe" ? Number(form.get("servingsPlanned") || 0) || undefined : undefined,
      sourcePlannedMealId: type === "leftover" ? String(form.get("sourcePlannedMealId") || "") || undefined : undefined
    };
    const beforeCount = meals.length;
    const created = await createPlannedMeal(payload);
    const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
    if (created.date >= range.start && created.date <= range.end) {
      setMeals((prev) => [...prev, created]);
    }
    e.currentTarget.reset();
    await refreshMeals();
  }

  async function removeMeal(id: string) {
    if (!confirm("Delete this planned meal?")) return;
    await deletePlannedMeal(id);
    setMeals((prev) => prev.filter((meal) => meal.id !== id));
    await refreshMeals();
  }

  const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
  const days = useMemo(() => {
    const list: string[] = [];
    let d = parseISODate(range.start);
    while (toISODate(d) <= range.end) {
      list.push(toISODate(d));
      d = addDays(d, 1);
    }
    return list;
  }, [range.start, range.end]);

  return (
    <div className="grid">
      <section className="panel">
        <div className="row">
          <button className={view === "week" ? "" : "secondary"} onClick={() => setView("week")}>Week</button>
          <button className={view === "month" ? "" : "secondary"} onClick={() => setView("month")}>Month</button>
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
        </div>
      </section>

      <section className="panel">
        <h2>{view === "week" ? "Week" : "Month"} view</h2>
        <div className="grid" style={{ overflowX: "auto" }}>
          {view === "week" ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Slot</th>
                  {days.map((day) => (
                    <th key={day}>{formatDateLabel(day)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.id}>
                    <td>{slot.name}</td>
                    {days.map((day) => (
                      <td key={day}>
                        {meals
                          .filter((meal) => meal.mealSlotId === slot.id && meal.date === day)
                          .map((meal) => (
                            <div key={meal.id}>
                              <MealLabel meal={meal} recipes={recipes} />
                              <button className="secondary" onClick={() => removeMeal(meal.id)}>x</button>
                            </div>
                          ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {days.map((day) => (
                <div key={day} className="panel" style={{ minHeight: 90 }}>
                  <strong>{formatDateLabel(day)}</strong>
                  {meals.filter((meal) => meal.date === day).map((meal) => (
                    <div key={meal.id}><MealLabel meal={meal} recipes={recipes} /></div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>Add planned meal</h3>
        <form className="grid" onSubmit={addMeal}>
          <div className="row">
            <input type="date" name="date" defaultValue={anchorDate} required />
            <select name="mealSlotId" required defaultValue="">
              <option value="" disabled>Select slot</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>{slot.name}</option>
              ))}
            </select>
            <select name="type" defaultValue="recipe">
              <option value="recipe">Recipe</option>
              <option value="leftover">Leftover</option>
              <option value="freeform">Freeform</option>
            </select>
          </div>
          <div className="row">
            <select name="recipeId" defaultValue="">
              <option value="">Select recipe</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
              ))}
            </select>
            <input type="number" name="servingsPlanned" placeholder="Servings planned" />
            <input name="freeformTitle" placeholder="Freeform title" />
            <input name="sourcePlannedMealId" placeholder="Leftover source meal id" />
          </div>
          <textarea name="notes" placeholder="Notes" />
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
  );
}

function MealLabel({ meal, recipes }: { meal: PlannedMeal; recipes: Recipe[] }) {
  if (meal.type === "recipe") {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    return <span>{recipe?.title || "Recipe"}</span>;
  }
  if (meal.type === "leftover") {
    return <span>Leftover</span>;
  }
  return <span>{meal.freeformTitle || "Freeform"}</span>;
}

function weekRange(anchorDate: string) {
  const start = startOfWeek(parseISODate(anchorDate));
  const end = addDays(start, 6);
  return { start: toISODate(start), end: toISODate(end) };
}

function monthRange(anchorDate: string) {
  const d = parseISODate(anchorDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}
