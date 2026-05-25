import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PlannedMeal, Recipe } from "../../models";
import { CookPlan, CookIngredientPlan } from "./cookPlan";
import { roundQty } from "../../utils/math";
import { formatDateLabel } from "../../utils/date";

export interface CookMealModalProps {
  open: boolean;
  meal: PlannedMeal;
  recipe?: Recipe;
  servings: number;
  initialPlan: CookPlan;
  onCancel: () => void;
  onConfirm: (plan: CookPlan) => void | Promise<void>;
}

function recomputeIngredient(ingredient: CookIngredientPlan): CookIngredientPlan {
  const coveredQty = roundQty(ingredient.allocations.reduce((sum, a) => sum + a.suggested, 0));
  const shortfallQty = roundQty(Math.max(ingredient.neededQty - coveredQty, 0));
  return { ...ingredient, coveredQty, shortfallQty };
}

function recomputePlan(plan: CookPlan): CookPlan {
  const ingredients = plan.ingredients.map(recomputeIngredient);
  const totalShortfall = ingredients
    .filter((p) => !p.altGroupSkipped)
    .reduce((sum, p) => sum + p.shortfallQty, 0);
  return { ...plan, ingredients, totalShortfall: roundQty(totalShortfall) };
}

export default function CookMealModal({
  open,
  meal,
  recipe,
  servings,
  initialPlan,
  onCancel,
  onConfirm
}: CookMealModalProps) {
  const [plan, setPlan] = useState<CookPlan>(initialPlan);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPlan(initialPlan);
    setSubmitting(false);
  }, [initialPlan, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  const groupedAltOptions = useMemo(() => {
    const groups = new Map<string, CookIngredientPlan[]>();
    plan.ingredients.forEach((ing) => {
      if (!ing.altGroup) return;
      const list = groups.get(ing.altGroup) ?? [];
      list.push(ing);
      groups.set(ing.altGroup, list);
    });
    return groups;
  }, [plan]);

  if (!open || typeof document === "undefined") return null;

  function updateAllocation(ingredientIndex: number, allocationIndex: number, value: number) {
    const next = { ...plan, ingredients: [...plan.ingredients] };
    const ingredient = { ...next.ingredients[ingredientIndex] };
    const allocations = [...ingredient.allocations];
    const allocation = { ...allocations[allocationIndex] };
    const sanitized = Math.max(0, Math.min(value, allocation.available));
    allocation.suggested = roundQty(sanitized);
    allocations[allocationIndex] = allocation;
    ingredient.allocations = allocations;
    next.ingredients[ingredientIndex] = ingredient;
    setPlan(recomputePlan(next));
  }

  function toggleAltOption(group: string, pantryItemId: string) {
    const next = { ...plan, ingredients: [...plan.ingredients] };
    next.ingredients = next.ingredients.map((ing) => {
      if (ing.altGroup !== group) return ing;
      return { ...ing, altGroupSkipped: ing.pantryItemId !== pantryItemId };
    });
    setPlan(recomputePlan(next));
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(plan);
    } finally {
      setSubmitting(false);
    }
  }

  const nonSkipped = plan.ingredients.filter((ing) => !ing.altGroupSkipped);

  return createPortal(
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="confirm-modal cook-modal" role="dialog" aria-modal="true">
        <h2>Cook: {recipe?.title || "Recipe"}</h2>
        <p className="muted cook-modal-sub">
          {formatDateLabel(meal.date)} • {servings} serving{servings === 1 ? "" : "s"} • base {recipe?.baseServings ?? "?"}
        </p>

        {nonSkipped.length === 0 ? (
          <p>This recipe has no ingredients to deduct.</p>
        ) : (
          <div className="cook-modal-body">
            {plan.ingredients.map((ing, idx) => {
              const altOptions = ing.altGroup ? groupedAltOptions.get(ing.altGroup) ?? [] : [];
              const isAltGroup = altOptions.length > 1;
              return (
                <div
                  key={`${ing.pantryItemId}-${idx}`}
                  className={`cook-ingredient ${ing.altGroupSkipped ? "muted" : ""}`}
                >
                  <div className="cook-ingredient-header">
                    {isAltGroup && (
                      <input
                        type="radio"
                        name={`alt-${ing.altGroup}`}
                        checked={!ing.altGroupSkipped}
                        onChange={() => toggleAltOption(ing.altGroup as string, ing.pantryItemId)}
                        aria-label={`Use ${ing.name}`}
                      />
                    )}
                    <strong>{ing.name}</strong>
                    <span className="muted">
                      need {ing.neededQty} {ing.unit}
                    </span>
                    {ing.shortfallQty > 0 && !ing.altGroupSkipped && (
                      <span className="cook-shortfall">short {ing.shortfallQty} {ing.unit}</span>
                    )}
                    {ing.missingPantryItem && (
                      <span className="cook-shortfall">pantry item missing</span>
                    )}
                  </div>
                  {!ing.altGroupSkipped && ing.allocations.length > 0 && (
                    <div className="cook-allocations">
                      {ing.allocations.map((alloc, allocIdx) => (
                        <div key={alloc.lotId} className="cook-allocation-row">
                          <span className="muted">
                            {alloc.expiresAt ? `exp ${alloc.expiresAt}` : "no expiry"}
                            {alloc.locationName ? ` • ${alloc.locationName}` : ""}
                            {` • on hand ${alloc.available}`}
                          </span>
                          <input
                            type="number"
                            min="0"
                            max={alloc.available}
                            step="0.01"
                            value={alloc.suggested}
                            onChange={(e) =>
                              updateAllocation(idx, allocIdx, Number(e.target.value))
                            }
                          />
                          <span className="muted">{ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!ing.altGroupSkipped && ing.allocations.length === 0 && !ing.missingPantryItem && (
                    <div className="muted cook-allocation-row">No active lots in stock.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {plan.totalShortfall > 0 && (
          <p className="cook-shortfall-summary">
            Total shortfall: {plan.totalShortfall}. You can still mark cooked — pantry will reflect what was actually deducted.
          </p>
        )}

        <div className="confirm-modal-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Marking…" : "Mark cooked"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
