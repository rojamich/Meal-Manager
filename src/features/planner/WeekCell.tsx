import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MealSlot, Person, PlannedMeal, Recipe } from "../../models";
import DraggableMeal from "./DraggableMeal";
import { colorFromId } from "./plannerHelpers";

function personBadgeFor(meal: PlannedMeal, people: Person[]) {
  if (!meal.assignedTo) return undefined;
  const person = people.find((p) => p.id === meal.assignedTo);
  if (!person) return undefined;
  return {
    name: person.name,
    initial: person.name.charAt(0).toUpperCase() || "?",
    color: person.color || "#64748b"
  };
}

export default function WeekCell({
  day,
  slotId,
  meals,
  recipes,
  slots: _slots,
  people,
  householdSize: _householdSize,
  onRemove,
  onSetServings,
  onAdd,
  onCook,
  onUncook,
  servingsEditingMealId,
  servingsEditValue,
  onServingsEditValue,
  onSaveServingsEdit,
  onCancelServingsEdit,
  inlinePanel,
  onActivateMeal,
  activeMealId,
  onClearActions,
  selectMode,
  selectedMealIds,
  onToggleSelected,
  onCellClick
}: {
  day: string;
  slotId: string;
  meals: PlannedMeal[];
  recipes: Recipe[];
  allMealsMap?: Map<string, PlannedMeal>;
  slots: MealSlot[];
  people: Person[];
  householdSize: number;
  onRemove: (id: string) => void | Promise<void>;
  onSetServings: (meal: PlannedMeal) => void | Promise<void>;
  onAdd: (anchorEl: HTMLElement) => void | Promise<void>;
  onCook: (meal: PlannedMeal) => void | Promise<void>;
  onUncook: (meal: PlannedMeal) => void | Promise<void>;
  servingsEditingMealId: string | null;
  servingsEditValue: number;
  onServingsEditValue: (value: number) => void;
  onSaveServingsEdit: (mealId: string) => void | Promise<void>;
  onCancelServingsEdit: () => void;
  inlinePanel: ReactNode;
  onActivateMeal: (mealId: string) => void;
  activeMealId: string | null;
  onClearActions: () => void;
  selectMode: boolean;
  selectedMealIds: string[];
  onToggleSelected: (mealId: string) => void;
  onCellClick: (day: string, slotId: string) => void | Promise<void>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `cell:${day}:${slotId}` });
  const colorForMeal = (meal: PlannedMeal) => colorFromId(meal.recipeId || meal.id);

  return (
    <td
      ref={setNodeRef}
      style={{
        background: isOver ? "#dbeafe" : undefined,
        boxShadow: isOver ? "inset 0 0 0 2px #2563eb" : undefined,
        minHeight: 88,
        verticalAlign: "top"
      }}
      onClick={() => {
        onClearActions();
        void onCellClick(day, slotId);
      }}
    >
      {meals.map((meal) => (
        <DraggableMeal
          key={meal.id}
          meal={meal}
          recipes={recipes}
          color={colorForMeal(meal)}
          personBadge={personBadgeFor(meal, people)}
          onRemove={onRemove}
          onSetServings={onSetServings}
          onCook={onCook}
          onUncook={onUncook}
          isServingsEditing={servingsEditingMealId === meal.id}
          servingsEditValue={servingsEditValue}
          onServingsEditValue={onServingsEditValue}
          onSaveServingsEdit={() => onSaveServingsEdit(meal.id)}
          onCancelServingsEdit={onCancelServingsEdit}
          onActivate={() => onActivateMeal(meal.id)}
          isActionsOpen={activeMealId === meal.id}
          selectMode={selectMode}
          selected={selectedMealIds.includes(meal.id)}
          onToggleSelected={() => onToggleSelected(meal.id)}
          dragDisabled={selectMode}
        />
      ))}
      <button
        className={meals.length === 0 ? "ghost cell-add" : "ghost cell-add cell-add-compact"}
        type="button"
        aria-label={meals.length === 0 ? "Add meal" : "Add another meal"}
        title={meals.length === 0 ? "Add meal" : "Add another meal"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void onAdd(e.currentTarget);
        }}
      >
        {meals.length === 0 ? "Add" : "+"}
      </button>
      {inlinePanel}
    </td>
  );
}
