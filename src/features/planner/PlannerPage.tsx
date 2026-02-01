import { RefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MealSlot, PlannedMeal, Recipe } from "../../models";
import { listMealSlots, listPlannedMeals, createPlannedMeal, deletePlannedMeal, updatePlannedMeal } from "../../db/repositories/mealPlanRepo";
import { listRecipes } from "../../db/repositories/recipeRepo";
import { formatDateLabel, parseISODate, toISODate, addDays } from "../../utils/date";
import { Link } from "react-router-dom";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";

export default function PlannerPage() {
  const [view, setView] = useState<"week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(toISODate(new Date()));
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeSlot, setActiveSlot] = useState<{ date: string; mealSlotId: string } | null>(null);
  const [inlineType, setInlineType] = useState<PlannedMeal["type"]>("recipe");
  const [inlineRecipeId, setInlineRecipeId] = useState("");
  const [inlineServings, setInlineServings] = useState("");
  const [inlineLeftoverSource, setInlineLeftoverSource] = useState("");
  const [inlineLeftoverServingsUsed, setInlineLeftoverServingsUsed] = useState("1");
  const [includeAnyRecent, setIncludeAnyRecent] = useState(false);
  const [inlineFreeformTitle, setInlineFreeformTitle] = useState("");
  const [inlineNotes, setInlineNotes] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recentPlanned, setRecentPlanned] = useState<PlannedMeal[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [leftoverEditMealId, setLeftoverEditMealId] = useState<string | null>(null);
  const [leftoverEditValue, setLeftoverEditValue] = useState<number>(0);

  useEffect(() => {
    listMealSlots().then(setSlots);
    listRecipes().then(setRecipes);
  }, []);

  const refreshMeals = useCallback(async () => {
    const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
    const data = await listPlannedMeals(range.start, range.end);
    const normalized = data.map((meal) => {
      if (meal.type !== "recipe") return meal;
      if (typeof meal.leftoverServingsRemaining === "number") return meal;
      const recipeDefault = recipes.find((r) => r.id === meal.recipeId)?.defaultServings ?? 1;
      const servings = meal.servingsPlanned ?? recipeDefault;
      return { ...meal, leftoverServingsRemaining: Math.max(servings - 1, 0) };
    });
    const toPersist = normalized.filter(
      (meal, idx) =>
        meal.type === "recipe" &&
        typeof data[idx].leftoverServingsRemaining !== "number" &&
        typeof meal.leftoverServingsRemaining === "number"
    );
    if (toPersist.length) {
      await Promise.all(
        toPersist.map((meal) =>
          updatePlannedMeal(meal.id, { leftoverServingsRemaining: meal.leftoverServingsRemaining })
        )
      );
    }
    setMeals([...normalized]);
    return normalized;
  }, [anchorDate, recipes, view]);

  useEffect(() => {
    refreshMeals();
  }, [refreshMeals]);

  const createMealAndRefresh = useCallback(
    async (
      payload: Omit<PlannedMeal, "id" | "createdAt" | "updatedAt">,
      options?: { skipLeftoverDecrement?: boolean }
    ) => {
      let created: PlannedMeal | undefined;
      if (payload.type === "leftover" && !options?.skipLeftoverDecrement) {
        const sourceId = payload.leftoverSourceMealId || payload.sourcePlannedMealId;
        const servingsUsed = payload.servingsPlanned ?? 1;
        if (sourceId) {
          const source = meals.find((m) => m.id === sourceId);
          const sourceServings = source?.servingsPlanned ?? 1;
          const originalRemaining =
            typeof source?.leftoverServingsRemaining === "number"
              ? source.leftoverServingsRemaining
              : Math.max(sourceServings - 1, 0);
          const nextRemaining = Math.max(originalRemaining - servingsUsed, 0);
          try {
            await updatePlannedMeal(sourceId, { leftoverServingsRemaining: nextRemaining });
            if (source) {
              setMeals((prev: PlannedMeal[]) =>
                prev.map((m: PlannedMeal) => (m.id === sourceId ? { ...m, leftoverServingsRemaining: nextRemaining } : m))
              );
            }
            created = await createPlannedMeal(payload);
          } catch (err) {
            await updatePlannedMeal(sourceId, { leftoverServingsRemaining: originalRemaining });
            throw err;
          }
        } else {
          created = await createPlannedMeal(payload);
        }
      } else {
        created = await createPlannedMeal(payload);
      }
      const range = view === "week" ? weekRange(anchorDate) : monthRange(anchorDate);
      if (created && created.date >= range.start && created.date <= range.end) {
        setMeals((prev: PlannedMeal[]) => [...prev, created as PlannedMeal]);
      }
      await refreshMeals();
      return created;
    },
    [anchorDate, meals, refreshMeals, view]
  );

  async function addMeal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const type = String(form.get("type")) as PlannedMeal["type"];
    const recipeId = type === "recipe" ? String(form.get("recipeId")) : undefined;
    const recipeDefault = recipes.find((r) => r.id === recipeId)?.defaultServings ?? 1;
    const servings = type === "recipe" ? Number(form.get("servingsPlanned") || recipeDefault) : undefined;
    const payload: Omit<PlannedMeal, "id" | "createdAt" | "updatedAt"> = {
      date: String(form.get("date")),
      mealSlotId: String(form.get("mealSlotId")),
      type,
      recipeId,
      freeformTitle: type === "freeform" ? String(form.get("freeformTitle")) : undefined,
      notes: String(form.get("notes") || "") || undefined,
      servingsPlanned: type === "recipe" ? servings : undefined,
      leftoverServingsRemaining: type === "recipe" ? Math.max((servings ?? 1) - 1, 0) : undefined,
      sourcePlannedMealId: type === "leftover" ? String(form.get("sourcePlannedMealId") || "") || undefined : undefined
    };
    await createMealAndRefresh(payload);
    e.currentTarget.reset();
  }

  async function removeMeal(id: string) {
    if (!confirm("Delete this planned meal?")) return;
    const meal = meals.find((m) => m.id === id);
    if (meal && meal.type === "leftover") {
      const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
      const servingsUsed = meal.servingsPlanned ?? 1;
      if (sourceId) {
        const source = meals.find((m) => m.id === sourceId);
        if (source) {
          const remaining = Math.max((source.leftoverServingsRemaining ?? 0) + servingsUsed, 0);
          await updatePlannedMeal(source.id, { leftoverServingsRemaining: remaining });
          setMeals((prev: PlannedMeal[]) =>
            prev.map((m: PlannedMeal) => (m.id === source.id ? { ...m, leftoverServingsRemaining: remaining } : m))
          );
        } else {
          const today = new Date();
          const start = addDays(today, -30);
          const recent = await listPlannedMeals(toISODate(start), toISODate(today));
          const fallback = recent.find((m) => m.id === sourceId);
          if (fallback) {
            const remaining = Math.max((fallback.leftoverServingsRemaining ?? 0) + servingsUsed, 0);
            await updatePlannedMeal(fallback.id, { leftoverServingsRemaining: remaining });
          }
        }
      }
    }
    await deletePlannedMeal(id);
    setMeals((prev: PlannedMeal[]) => prev.filter((meal: PlannedMeal) => meal.id !== id));
    await refreshMeals();
  }

  const resetInline = useCallback(() => {
    setInlineType("recipe");
    setInlineRecipeId("");
    setInlineServings("");
    setInlineLeftoverSource("");
    setInlineLeftoverServingsUsed("1");
    setIncludeAnyRecent(false);
    setInlineFreeformTitle("");
    setInlineNotes("");
    setRecipeSearch("");
  }, []);

  const openInlineAdd = useCallback(
    async (slot: { date: string; mealSlotId: string }) => {
      setActiveSlot(slot);
      resetInline();
      const range = weekRange(anchorDate);
      const rangeStart = parseISODate(range.start);
      const start = addDays(rangeStart, -14);
      const recent = await listPlannedMeals(toISODate(start), range.start);
      const normalized = recent.map((meal) => {
        if (meal.type !== "recipe") return meal;
        if (typeof meal.leftoverServingsRemaining === "number") return meal;
        const recipeDefault = recipes.find((r) => r.id === meal.recipeId)?.defaultServings ?? 1;
        const servings = meal.servingsPlanned ?? recipeDefault;
        return { ...meal, leftoverServingsRemaining: Math.max(servings - 1, 0) };
      });
      const toPersist = normalized.filter(
        (meal, idx) =>
          meal.type === "recipe" &&
          typeof recent[idx].leftoverServingsRemaining !== "number" &&
          typeof meal.leftoverServingsRemaining === "number"
      );
      if (toPersist.length) {
        await Promise.all(
          toPersist.map((meal) =>
            updatePlannedMeal(meal.id, { leftoverServingsRemaining: meal.leftoverServingsRemaining })
          )
        );
      }
      setRecentPlanned([...normalized]);
    },
    [anchorDate, recipes, resetInline]
  );

  const buildInlinePayload = useCallback((): Omit<PlannedMeal, "id" | "createdAt" | "updatedAt"> | null => {
    if (!activeSlot) return null;
    if (inlineType === "recipe") {
      const recipe = recipes.find((r) => r.id === inlineRecipeId);
      if (!recipe) return null;
      const servings = inlineServings ? Number(inlineServings) : recipe.defaultServings;
      return {
        date: activeSlot.date,
        mealSlotId: activeSlot.mealSlotId,
        type: "recipe",
        recipeId: recipe.id,
        servingsPlanned: servings,
        leftoverServingsRemaining: Math.max(servings - 1, 0),
        notes: inlineNotes || undefined
      };
    }
    if (inlineType === "leftover") {
      if (!inlineLeftoverSource) return null;
      const servingsUsed = Math.max(Number(inlineLeftoverServingsUsed || 1), 1);
      if (inlineLeftoverSource.startsWith("meal:")) {
        const mealId = inlineLeftoverSource.slice(5);
        const source = meals.find((m) => m.id === mealId);
        const sourceServings = source?.servingsPlanned ?? 1;
        const effectiveRemaining =
          typeof source?.leftoverServingsRemaining === "number"
            ? source.leftoverServingsRemaining
            : Math.max(sourceServings - 1, 0);
        const remaining = effectiveRemaining;
        if (remaining <= 0) {
          alert("No leftovers remaining");
          return null;
        }
        return {
          date: activeSlot.date,
          mealSlotId: activeSlot.mealSlotId,
          type: "leftover",
          sourcePlannedMealId: mealId,
          leftoverSourceMealId: mealId,
          servingsPlanned: servingsUsed,
          notes: inlineNotes || undefined
        };
      }
      if (inlineLeftoverSource.startsWith("recipe:")) {
        const recipeId = inlineLeftoverSource.slice(7);
        const recipe = recipes.find((r) => r.id === recipeId);
        return {
          date: activeSlot.date,
          mealSlotId: activeSlot.mealSlotId,
          type: "leftover",
          freeformTitle: recipe?.title || "Leftover",
          servingsPlanned: servingsUsed,
          notes: inlineNotes || undefined
        };
      }
      return null;
    }
    if (!inlineFreeformTitle.trim()) return null;
    return {
      date: activeSlot.date,
      mealSlotId: activeSlot.mealSlotId,
      type: "freeform",
      freeformTitle: inlineFreeformTitle.trim(),
      notes: inlineNotes || undefined
    };
  }, [
    activeSlot,
    inlineFreeformTitle,
    inlineLeftoverSource,
    inlineLeftoverServingsUsed,
    inlineNotes,
    inlineRecipeId,
    inlineServings,
    inlineType,
    recipes,
    meals
  ]);

  useEffect(() => {
    if (!activeSlot) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveSlot(null);
    };
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      setActiveSlot(null);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handlePointer, true);
    document.addEventListener("touchstart", handlePointer, true);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handlePointer, true);
      document.removeEventListener("touchstart", handlePointer, true);
    };
  }, [activeSlot]);

  const headerLabel = useMemo(() => {
    if (view === "week") {
      const range = weekRange(anchorDate);
      const start = parseISODate(range.start);
      const end = parseISODate(range.end);
      const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `${startLabel}-${endLabel}`;
    }
    const d = parseISODate(anchorDate);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [anchorDate, view]);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      const base = parseISODate(anchorDate);
      if (view === "week") {
        setAnchorDate(toISODate(addDays(base, 7 * direction)));
      } else {
        const next = new Date(base.getFullYear(), base.getMonth() + direction, base.getDate());
        setAnchorDate(toISODate(next));
      }
    },
    [anchorDate, view]
  );

  const goToday = useCallback(() => {
    setAnchorDate(toISODate(new Date()));
  }, []);

  const copyWeek = useCallback(
    async (sourceOffsetDays: number, targetOffsetDays: number) => {
      const currentRange = weekRange(anchorDate);
      const sourceStart = addDays(parseISODate(currentRange.start), sourceOffsetDays);
      const sourceEnd = addDays(parseISODate(currentRange.end), sourceOffsetDays);
      const sourceMeals = await listPlannedMeals(toISODate(sourceStart), toISODate(sourceEnd));
      const count = sourceMeals.length;
      if (!count) {
        alert("No meals to copy in the source week.");
        return;
      }
      if (!confirm(`Copy ${count} meals?`)) return;
      await Promise.all(
        sourceMeals.map((meal) =>
          createPlannedMeal({
            date: toISODate(addDays(parseISODate(meal.date), targetOffsetDays - sourceOffsetDays)),
            mealSlotId: meal.mealSlotId,
            type: meal.type,
            recipeId: meal.recipeId,
            sourcePlannedMealId: meal.sourcePlannedMealId,
            leftoverSourceMealId: meal.leftoverSourceMealId,
            leftoverServingsRemaining: meal.leftoverServingsRemaining,
            freeformTitle: meal.freeformTitle,
            notes: meal.notes,
            servingsPlanned: meal.servingsPlanned
          })
        )
      );
      await refreshMeals();
    },
    [anchorDate, refreshMeals]
  );

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

  const mealsById = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    meals.forEach((meal) => map.set(meal.id, meal));
    return map;
  }, [meals]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const overId = String(over.id);
      if (!overId.startsWith("cell:")) return;
      const [, day, slotId] = overId.split(":");
      if (!day || !slotId) return;

      const activeId = String(active.id);
      if (activeId.startsWith("meal:")) {
        const mealId = activeId.slice(5);
        const meal = mealsById.get(mealId);
        if (!meal) return;
        if (meal.date === day && meal.mealSlotId === slotId) return;
        await updatePlannedMeal(meal.id, { date: day, mealSlotId: slotId });
        setMeals((prev: PlannedMeal[]) =>
          prev.map((m: PlannedMeal) => (m.id === meal.id ? { ...m, date: day, mealSlotId: slotId } : m))
        );
        return;
      }

      if (activeId.startsWith("leftover:")) {
        const sourceId = activeId.slice(9);
        const source = mealsById.get(sourceId);
        if (!source) return;
        const remaining = source.leftoverServingsRemaining ?? 0;
        if (remaining <= 0) {
          alert("No leftovers remaining");
          return;
        }
        await createMealAndRefresh({
          date: day,
          mealSlotId: slotId,
          type: "leftover",
          leftoverSourceMealId: source.id,
          sourcePlannedMealId: source.id,
          servingsPlanned: 1
        });
      }
    },
    [createMealAndRefresh, mealsById]
  );

  return (
    <div className="grid">
      <section className="panel">
        <div className="row">
          <button className="secondary" onClick={() => navigate(-1)} aria-label="Previous">
            &lt;
          </button>
          <button className="secondary" onClick={() => navigate(1)} aria-label="Next">
            &gt;
          </button>
          <button className="secondary" onClick={goToday}>
            Today
          </button>
          <strong>{headerLabel}</strong>
          <button className={view === "week" ? "" : "secondary"} onClick={() => setView("week")}>
            Week
          </button>
          <button className={view === "month" ? "" : "secondary"} onClick={() => setView("month")}>
            Month
          </button>
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          {view === "week" && (
            <>
              <button className="secondary" onClick={() => copyWeek(-7, 0)}>
                Copy last week {"->"} this week
              </button>
              <button className="secondary" onClick={() => copyWeek(0, 7)}>
                Copy this week {"->"} next week
              </button>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>{view === "week" ? "Week" : "Month"} view</h2>
        <div className="grid" style={{ overflowX: "auto" }}>
          {view === "week" ? (
            <DndContext onDragEnd={handleDragEnd}>
            <table className="table">
              <thead>
                <tr>
                  <th>Slot</th>
                  {days.map((day) => (
                    <th key={day}>{formatWeekdayLabel(day)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.id}>
                    <td>{slot.name}</td>
                    {days.map((day) => (
                      <WeekCell
                        key={`${day}-${slot.id}`}
                        day={day}
                        slotId={slot.id}
                        meals={meals.filter((meal) => meal.mealSlotId === slot.id && meal.date === day)}
                        recipes={recipes}
                        onRemove={removeMeal}
                        onSetLeftovers={async (meal) => {
                          setLeftoverEditMealId(meal.id);
                          setLeftoverEditValue(meal.leftoverServingsRemaining ?? 0);
                        }}
                        onAdd={() => openInlineAdd({ date: day, mealSlotId: slot.id })}
                        editingMealId={leftoverEditMealId}
                        editValue={leftoverEditValue}
                        onEditValue={setLeftoverEditValue}
                        onSaveEdit={async (mealId) => {
                          const value = Math.max(Number(leftoverEditValue || 0), 0);
                          await updatePlannedMeal(mealId, { leftoverServingsRemaining: value });
                          setMeals((prev: PlannedMeal[]) =>
                            prev.map((m: PlannedMeal) =>
                              m.id === mealId ? { ...m, leftoverServingsRemaining: value } : m
                            )
                          );
                          setLeftoverEditMealId(null);
                        }}
                        onCancelEdit={() => setLeftoverEditMealId(null)}
                        inlinePanel={
                          activeSlot && activeSlot.date === day && activeSlot.mealSlotId === slot.id ? (
                            <InlineAddPanel
                              recipes={recipes}
                              slots={slots}
                              recentPlanned={recentPlanned}
                              currentMeals={meals}
                              inlineType={inlineType}
                              setInlineType={setInlineType}
                              inlineRecipeId={inlineRecipeId}
                              setInlineRecipeId={setInlineRecipeId}
                              inlineServings={inlineServings}
                              setInlineServings={setInlineServings}
                              inlineLeftoverSource={inlineLeftoverSource}
                              setInlineLeftoverSource={setInlineLeftoverSource}
                              inlineLeftoverServingsUsed={inlineLeftoverServingsUsed}
                              setInlineLeftoverServingsUsed={setInlineLeftoverServingsUsed}
                              includeAnyRecent={includeAnyRecent}
                              setIncludeAnyRecent={setIncludeAnyRecent}
                              inlineFreeformTitle={inlineFreeformTitle}
                              setInlineFreeformTitle={setInlineFreeformTitle}
                              inlineNotes={inlineNotes}
                              setInlineNotes={setInlineNotes}
                              recipeSearch={recipeSearch}
                              setRecipeSearch={setRecipeSearch}
                              panelRef={panelRef}
                              onCancel={() => setActiveSlot(null)}
                              onSave={async () => {
                                const payload = buildInlinePayload();
                                if (!payload) return;
                                await createMealAndRefresh(payload);
                                resetInline();
                                setActiveSlot(null);
                              }}
                            />
                          ) : null
                        }
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </DndContext>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {days.map((day) => (
                <div key={day} className="panel" style={{ minHeight: 90 }}>
                  <strong>{formatDateLabel(day)}</strong>
                  {slots.map((slot) => (
                    <div key={slot.id}>
                      <strong>{slot.name}</strong>
                      {meals
                        .filter((meal) => meal.date === day && meal.mealSlotId === slot.id)
                        .map((meal) => (
                          <div key={meal.id}>
                            <MealLabel meal={meal} recipes={recipes} />
                            <button className="secondary" onClick={() => removeMeal(meal.id)}>x</button>
                          </div>
                        ))}
                      {meals.filter((meal) => meal.date === day && meal.mealSlotId === slot.id).length === 0 && (
                        <button
                          className="ghost"
                          onClick={() => openInlineAdd({ date: day, mealSlotId: slot.id })}
                        >
                          Add
                        </button>
                      )}
                      {activeSlot && activeSlot.date === day && activeSlot.mealSlotId === slot.id && (
                        <InlineAddPanel
                          recipes={recipes}
                          slots={slots}
                          recentPlanned={recentPlanned}
                          currentMeals={meals}
                          inlineType={inlineType}
                          setInlineType={setInlineType}
                          inlineRecipeId={inlineRecipeId}
                          setInlineRecipeId={setInlineRecipeId}
                          inlineServings={inlineServings}
                          setInlineServings={setInlineServings}
                          inlineLeftoverSource={inlineLeftoverSource}
                          setInlineLeftoverSource={setInlineLeftoverSource}
                          inlineLeftoverServingsUsed={inlineLeftoverServingsUsed}
                          setInlineLeftoverServingsUsed={setInlineLeftoverServingsUsed}
                          includeAnyRecent={includeAnyRecent}
                          setIncludeAnyRecent={setIncludeAnyRecent}
                          inlineFreeformTitle={inlineFreeformTitle}
                          setInlineFreeformTitle={setInlineFreeformTitle}
                          inlineNotes={inlineNotes}
                          setInlineNotes={setInlineNotes}
                          recipeSearch={recipeSearch}
                          setRecipeSearch={setRecipeSearch}
                          panelRef={panelRef}
                          onCancel={() => setActiveSlot(null)}
                          onSave={async () => {
                            const payload = buildInlinePayload();
                            if (!payload) return;
                            await createMealAndRefresh(payload);
                            resetInline();
                            setActiveSlot(null);
                          }}
                        />
                      )}
                    </div>
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

function InlineAddPanel({
  recipes,
  slots,
  recentPlanned,
  currentMeals,
  inlineType,
  setInlineType,
  inlineRecipeId,
  setInlineRecipeId,
  inlineServings,
  setInlineServings,
  inlineLeftoverSource,
  setInlineLeftoverSource,
  inlineLeftoverServingsUsed,
  setInlineLeftoverServingsUsed,
  includeAnyRecent,
  setIncludeAnyRecent,
  inlineFreeformTitle,
  setInlineFreeformTitle,
  inlineNotes,
  setInlineNotes,
  recipeSearch,
  setRecipeSearch,
  panelRef,
  onSave,
  onCancel
}: {
  recipes: Recipe[];
  slots: MealSlot[];
  recentPlanned: PlannedMeal[];
  currentMeals: PlannedMeal[];
  inlineType: PlannedMeal["type"];
  setInlineType: (value: PlannedMeal["type"]) => void;
  inlineRecipeId: string;
  setInlineRecipeId: (value: string) => void;
  inlineServings: string;
  setInlineServings: (value: string) => void;
  inlineLeftoverSource: string;
  setInlineLeftoverSource: (value: string) => void;
  inlineLeftoverServingsUsed: string;
  setInlineLeftoverServingsUsed: (value: string) => void;
  includeAnyRecent: boolean;
  setIncludeAnyRecent: (value: boolean) => void;
  inlineFreeformTitle: string;
  setInlineFreeformTitle: (value: string) => void;
  inlineNotes: string;
  setInlineNotes: (value: string) => void;
  recipeSearch: string;
  setRecipeSearch: (value: string) => void;
  panelRef: RefObject<HTMLDivElement>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(recipeSearch.trim().toLowerCase())
  );
  const mergedMeals = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    currentMeals.forEach((meal) => map.set(meal.id, meal));
    recentPlanned.forEach((meal) => {
      if (!map.has(meal.id)) map.set(meal.id, meal);
    });
    return Array.from(map.values());
  }, [currentMeals, recentPlanned]);
  const effectiveRemaining = (meal: PlannedMeal) => {
    if (typeof meal.leftoverServingsRemaining === "number") return meal.leftoverServingsRemaining;
    if (meal.type !== "recipe") return 0;
    return Math.max((meal.servingsPlanned ?? 1) - 1, 0);
  };
  const recentMealOptions = mergedMeals
    .filter((meal) => (includeAnyRecent || meal.type === "recipe") && effectiveRemaining(meal) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const recipeTitle = (recipeId?: string) => recipes.find((r) => r.id === recipeId)?.title || "Recipe";
  const slotLabel = (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot";
  const typeLabel = (type: PlannedMeal["type"]) =>
    type === "recipe" ? "Recipe" : type === "leftover" ? "Leftover" : "Freeform";
  const firstRecipeSearchRef = useRef<HTMLInputElement | null>(null);
  const firstFreeformRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inlineType === "recipe" && firstRecipeSearchRef.current) {
      firstRecipeSearchRef.current.focus();
    }
    if (inlineType === "freeform" && firstFreeformRef.current) {
      firstFreeformRef.current.focus();
    }
  }, [inlineType]);

  return (
    <div
      className="panel"
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row">
        <select value={inlineType} onChange={(e) => setInlineType(e.target.value as PlannedMeal["type"])}>
          <option value="recipe">Recipe</option>
          <option value="leftover">Leftover</option>
          <option value="freeform">Freeform</option>
        </select>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>

      {inlineType === "recipe" && (
        <>
          {recipes.length === 0 ? (
            <p>
              No recipes yet. <Link className="tag" to="/recipes">Go to Recipes</Link>
            </p>
          ) : (
            <>
              <input
                ref={firstRecipeSearchRef}
                placeholder="Search recipes"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
              />
              <select
                value={inlineRecipeId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setInlineRecipeId(nextId);
                  const recipe = recipes.find((r) => r.id === nextId);
                  if (recipe) setInlineServings(String(recipe.defaultServings));
                }}
              >
                <option value="">Select recipe</option>
                {filteredRecipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Servings"
                value={inlineServings}
                onChange={(e) => setInlineServings(e.target.value)}
              />
            </>
          )}
        </>
      )}

      {inlineType === "leftover" && (
        <>
          {recentMealOptions.length === 0 && recipes.length === 0 ? (
            <p>
              No recent meals or recipes yet. <Link className="tag" to="/recipes">Go to Recipes</Link>
            </p>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={includeAnyRecent}
                  onChange={(e) => setIncludeAnyRecent(e.target.checked)}
                />
                Any recent meal
              </label>
              <select value={inlineLeftoverSource} onChange={(e) => setInlineLeftoverSource(e.target.value)}>
                <option value="">Select source</option>
                {recentMealOptions.map((meal) => (
                  <option key={meal.id} value={`meal:${meal.id}`}>
                    {recipeTitle(meal.recipeId)} | {meal.date} | {slotLabel(meal.mealSlotId)} | {typeLabel(meal.type)} | remaining {effectiveRemaining(meal)}
                  </option>
                ))}
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={`recipe:${recipe.id}`}>
                    Recipe: {recipe.title}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder="Servings used"
                value={inlineLeftoverServingsUsed}
                onChange={(e) => setInlineLeftoverServingsUsed(e.target.value)}
              />
            </>
          )}
        </>
      )}

      {inlineType === "freeform" && (
        <>
          <input
            ref={firstFreeformRef}
            placeholder="Title"
            value={inlineFreeformTitle}
            onChange={(e) => setInlineFreeformTitle(e.target.value)}
          />
        </>
      )}

      <textarea placeholder="Notes" value={inlineNotes} onChange={(e) => setInlineNotes(e.target.value)} />
      <div className="row">
        <button onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function MealLabel({
  meal,
  recipes,
  showRemaining = true
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  showRemaining?: boolean;
}) {
  if (meal.type === "recipe") {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    const remaining =
      typeof meal.leftoverServingsRemaining === "number"
        ? meal.leftoverServingsRemaining
        : Math.max((meal.servingsPlanned ?? 1) - 1, 0);
    return (
      <span>
        {recipe?.title || "Recipe"}
        {showRemaining && typeof remaining === "number" && remaining > 0 ? ` (${remaining})` : ""}
      </span>
    );
  }
  if (meal.type === "leftover") {
    return <span>Leftover</span>;
  }
  return <span>{meal.freeformTitle || "Freeform"}</span>;
}

function WeekCell({
  day,
  slotId,
  meals,
  recipes,
  onRemove,
  onSetLeftovers,
  onAdd,
  editingMealId,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
  inlinePanel
}: {
  day: string;
  slotId: string;
  meals: PlannedMeal[];
  recipes: Recipe[];
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  onAdd: () => void | Promise<void>;
  editingMealId: string | null;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: (mealId: string) => void | Promise<void>;
  onCancelEdit: () => void;
  inlinePanel: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell:${day}:${slotId}` });

  return (
    <td ref={setNodeRef} style={{ background: isOver ? "#e0f2fe" : undefined }}>
      {meals.map((meal) => (
        <DraggableMeal
          key={meal.id}
          meal={meal}
          recipes={recipes}
          onRemove={onRemove}
          onSetLeftovers={onSetLeftovers}
          isEditing={editingMealId === meal.id}
          editValue={editValue}
          onEditValue={onEditValue}
          onSaveEdit={() => onSaveEdit(meal.id)}
          onCancelEdit={onCancelEdit}
        />
      ))}
      {meals.length === 0 && (
        <button className="ghost" onClick={onAdd}>
          Add
        </button>
      )}
      {inlinePanel}
    </td>
  );
}

function DraggableMeal({
  meal,
  recipes,
  onRemove,
  onSetLeftovers,
  isEditing,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  isEditing: boolean;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `meal:${meal.id}`
  });
  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  };
  const remaining =
    typeof meal.leftoverServingsRemaining === "number"
      ? meal.leftoverServingsRemaining
      : Math.max((meal.servingsPlanned ?? 1) - 1, 0);

  return (
    <div ref={setNodeRef} style={style}>
      <button
        className="secondary"
        type="button"
        {...attributes}
        {...listeners}
        style={{ cursor: "grab" }}
      >
        Drag
      </button>
      <MealLabel meal={meal} recipes={recipes} showRemaining={false} />
      {meal.type === "recipe" && (
        <>
          <LeftoverBadge
            mealId={meal.id}
            remaining={meal.leftoverServingsRemaining}
            onClick={() => onSetLeftovers(meal)}
          />
        </>
      )}
      <button
        className="secondary"
        onClick={(e) => {
          e.stopPropagation();
          void onRemove(meal.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        x
      </button>
      {meal.type === "recipe" && isEditing && (
        <div className="row" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <input
            type="number"
            min="0"
            value={editValue}
            onChange={(e) => onEditValue(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <button className="secondary" onClick={(e) => { e.stopPropagation(); void onSaveEdit(); }}>
            Save
          </button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function LeftoverBadge({
  mealId,
  remaining,
  onClick
}: {
  mealId: string;
  remaining?: number;
  onClick: () => void;
}) {
  const canDrag = typeof remaining === "number" && remaining > 0;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `leftover:${mealId}`,
    disabled: !canDrag
  });
  if (!canDrag) {
    return (
      <button
        className="secondary"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ padding: "2px 6px", fontSize: 12, opacity: 0.6 }}
        title="Set leftovers"
      >
        L
      </button>
    );
  }
  const label = `(${remaining})`;
  return (
    <button
      ref={setNodeRef}
      className="secondary"
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ padding: "2px 6px", fontSize: 12, opacity: canDrag ? 1 : 0.6 }}
      title={canDrag ? "Drag to create leftover" : "Set leftovers"}
    >
      {label}
    </button>
  );
}

// Leftover badge serves as the drag handle; no separate token needed.

function formatWeekdayLabel(value: string) {
  const d = parseISODate(value);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function weekRange(anchorDate: string) {
  const start = parseISODate(anchorDate);
  const end = addDays(start, 6);
  return { start: toISODate(start), end: toISODate(end) };
}

function monthRange(anchorDate: string) {
  const d = parseISODate(anchorDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}
