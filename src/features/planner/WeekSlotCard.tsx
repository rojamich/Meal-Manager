import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { MealSlot, PlannedMeal, Recipe } from "../../models";
import DraggableMeal from "./DraggableMeal";
import { colorFromId, formatWeekdayLabel } from "./plannerHelpers";

export default function WeekSlotCard({
  day,
  slotId,
  slotName,
  meals,
  recipes,
  allMealsMap,
  slots,
  householdSize,
  onRemove,
  onSetLeftovers,
  onSetServings,
  onAdd,
  onCook,
  onUncook,
  editingMealId,
  editValue,
  onEditValue,
  onSaveEdit,
  onCancelEdit,
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
  slotName: string;
  meals: PlannedMeal[];
  recipes: Recipe[];
  allMealsMap: Map<string, PlannedMeal>;
  slots: MealSlot[];
  householdSize: number;
  onRemove: (id: string) => void | Promise<void>;
  onSetLeftovers: (meal: PlannedMeal) => void | Promise<void>;
  onSetServings: (meal: PlannedMeal) => void | Promise<void>;
  onAdd: (anchorEl: HTMLElement) => void | Promise<void>;
  onCook: (meal: PlannedMeal) => void | Promise<void>;
  onUncook: (meal: PlannedMeal) => void | Promise<void>;
  editingMealId: string | null;
  editValue: number;
  onEditValue: (value: number) => void;
  onSaveEdit: (mealId: string) => void | Promise<void>;
  onCancelEdit: () => void;
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
  const recipeTitle = (recipeId?: string) => recipes.find((r) => r.id === recipeId)?.title || "Recipe";
  const slotLabel = (mealSlotId?: string) => slots.find((slot) => slot.id === mealSlotId)?.name || "Slot";

  const colorForMeal = (meal: PlannedMeal) => {
    let colorKey = meal.recipeId || meal.id;
    if (meal.type === "leftover") {
      const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
      const source = sourceId ? allMealsMap.get(sourceId) : undefined;
      colorKey = source?.recipeId || colorKey;
    }
    return colorFromId(colorKey);
  };

  const sourceInfo = (meal: PlannedMeal) => {
    if (meal.type !== "leftover") return "";
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const source = sourceId ? allMealsMap.get(sourceId) : undefined;
    if (!source) return "From: Unknown";
    return `From: ${recipeTitle(source.recipeId)} (${formatWeekdayLabel(source.date)} ${slotLabel(source.mealSlotId)})`;
  };

  const leftoverChipLabel = (meal: PlannedMeal) => {
    if (meal.type !== "leftover") return undefined;
    const sourceId = meal.leftoverSourceMealId || meal.sourcePlannedMealId;
    const source = sourceId ? allMealsMap.get(sourceId) : undefined;
    if (source?.recipeId) return `Leftover: ${recipeTitle(source.recipeId)}`;
    if (source?.freeformTitle) return `Leftover: ${source.freeformTitle}`;
    if (meal.freeformTitle) return `Leftover: ${meal.freeformTitle}`;
    return "Leftover";
  };

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        marginTop: 10,
        background: isOver ? "#dbeafe" : undefined,
        boxShadow: isOver ? "inset 0 0 0 2px #2563eb" : undefined,
        minHeight: 88
      }}
      onClick={() => {
        onClearActions();
        void onCellClick(day, slotId);
      }}
    >
      <strong>{slotName}</strong>
      {meals.map((meal) => (
        <DraggableMeal
          key={meal.id}
          meal={meal}
          recipes={recipes}
          householdSize={householdSize}
          color={colorForMeal(meal)}
          sourceInfo={sourceInfo(meal)}
          leftoverChipLabel={leftoverChipLabel(meal)}
          onRemove={onRemove}
          onSetLeftovers={onSetLeftovers}
          onSetServings={onSetServings}
          onCook={onCook}
          onUncook={onUncook}
          isEditing={editingMealId === meal.id}
          editValue={editValue}
          onEditValue={onEditValue}
          onSaveEdit={() => onSaveEdit(meal.id)}
          onCancelEdit={onCancelEdit}
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
      {meals.length === 0 && (
        <button
          className="ghost"
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void onAdd(e.currentTarget);
          }}
        >
          Add
        </button>
      )}
      {inlinePanel}
    </div>
  );
}
