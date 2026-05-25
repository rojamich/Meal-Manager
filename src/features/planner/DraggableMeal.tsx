import { useDraggable } from "@dnd-kit/core";
import { PlannedMeal, Recipe } from "../../models";
import { getEffectiveLeftoverRemaining } from "./plannerDomain";
import { tintFromAccent } from "./plannerHelpers";
import LeftoverBadge from "./LeftoverBadge";
import MealLabel from "./MealLabel";

export default function DraggableMeal({
  meal,
  recipes,
  householdSize,
  color,
  sourceInfo,
  leftoverChipLabel,
  onRemove,
  onSetLeftovers,
  onSetServings,
  onCook,
  onUncook,
  isEditing,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
  isServingsEditing,
  servingsEditValue,
  onServingsEditValue,
  onSaveServingsEdit,
  onCancelServingsEdit,
  onActivate,
  isActionsOpen,
  selectMode,
  selected,
  onToggleSelected,
  dragDisabled
}: {
  meal: PlannedMeal;
  recipes: Recipe[];
  householdSize: number;
  color: string;
  sourceInfo: string;
  leftoverChipLabel?: string;
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  onSetServings: (meal: PlannedMeal) => void | Promise<void>;
  onCook: (meal: PlannedMeal) => void | Promise<void>;
  onUncook: (meal: PlannedMeal) => void | Promise<void>;
  isEditing: boolean;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: () => void | Promise<void>;
  onCancelEdit: () => void;
  isServingsEditing: boolean;
  servingsEditValue: number;
  onServingsEditValue: (value: number) => void;
  onSaveServingsEdit: () => void | Promise<void>;
  onCancelServingsEdit: () => void;
  onActivate: () => void;
  isActionsOpen: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `meal:${meal.id}`,
    disabled: dragDisabled
  });
  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  };
  const remaining = getEffectiveLeftoverRemaining(meal, householdSize);

  return (
    <div
      ref={setNodeRef}
      className="meal-chip"
      style={{
        ...style,
        borderLeft: `4px solid ${color}`,
        paddingLeft: 6,
        background: tintFromAccent(color),
        color: "#0f172a"
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (selectMode) return;
        onActivate();
      }}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select meal"
        />
      ) : (
        <button
          className="drag-handle"
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag meal"
          onClick={(e) => e.stopPropagation()}
        >
          ::
        </button>
      )}
      <span
        className="meal-primary-label"
        title={meal.type === "leftover" ? sourceInfo : undefined}
        tabIndex={meal.type === "leftover" ? 0 : -1}
        aria-label={meal.type === "leftover" ? sourceInfo : undefined}
      >
        {meal.type === "leftover" && leftoverChipLabel ? (
          leftoverChipLabel
        ) : (
          <MealLabel meal={meal} recipes={recipes} householdSize={householdSize} showRemaining={false} />
        )}
      </span>
      {meal.type === "recipe" && (
        <>
          <LeftoverBadge
            mealId={meal.id}
            remaining={remaining}
            onClick={() => onSetLeftovers(meal)}
            disabled={selectMode}
          />
          <button
            className="secondary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onSetServings(meal);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Servings
          </button>
          {meal.cookedAt ? (
            <button
              type="button"
              className="cooked-badge"
              title="Mark not cooked (pantry will not be restored)"
              onClick={(e) => {
                e.stopPropagation();
                void onUncook(meal);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Cooked ✓
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={(e) => {
                e.stopPropagation();
                void onCook(meal);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Cook
            </button>
          )}
        </>
      )}
      <button
        className="danger"
        onClick={(e) => {
          e.stopPropagation();
          void onRemove(meal.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        x
      </button>
      {isActionsOpen && (
        <div
          className="action-sheet mobile-only"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {meal.type === "recipe" && meal.recipeId && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                const baseUrl = window.location.href.split("#")[0];
                const servings = Math.max(meal.servingsPlanned ?? 1, 1);
                window.open(`${baseUrl}#/cook/${meal.recipeId}?servings=${servings}`, "_blank");
              }}
            >
              Cook mode
            </button>
          )}
          <button className="danger" onClick={() => void onRemove(meal.id)}>
            Delete
          </button>
          {meal.type === "recipe" && (
            <button className="secondary" onClick={() => void onSetServings(meal)}>
              Servings
            </button>
          )}
        </div>
      )}
      {meal.type === "recipe" && isEditing && (
        <div className="row" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <label className="field-stack compact-field">
            <span>Leftovers remaining</span>
            <input
              type="number"
              min="0"
              value={editValue}
              onChange={(e) => onEditValue(Number(e.target.value))}
              style={{ width: 96 }}
            />
          </label>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); void onSaveEdit(); }}>
            Save
          </button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>
            Cancel
          </button>
        </div>
      )}
      {meal.type === "recipe" && isServingsEditing && (
        <div className="row" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <label className="field-stack compact-field">
            <span>Servings planned</span>
            <input
              type="number"
              min="1"
              value={servingsEditValue}
              onChange={(e) => onServingsEditValue(Number(e.target.value))}
              style={{ width: 96 }}
            />
          </label>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); void onSaveServingsEdit(); }}>
            Save
          </button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); onCancelServingsEdit(); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
