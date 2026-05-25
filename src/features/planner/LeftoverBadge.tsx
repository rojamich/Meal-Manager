import { useDraggable } from "@dnd-kit/core";

export default function LeftoverBadge({
  mealId,
  remaining,
  onClick,
  disabled = false
}: {
  mealId: string;
  remaining?: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  const canDrag = !disabled && typeof remaining === "number" && remaining > 0;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `leftover:${mealId}`,
    disabled: !canDrag
  });
  if (!canDrag) {
    return (
      <button
        className="leftover-badge"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{ opacity: 0.9 }}
        title="Set leftovers"
      >
        {typeof remaining === "number" ? `${remaining} left` : "Leftovers"}
      </button>
    );
  }
  const label = `${remaining} left`;
  return (
    <button
      ref={setNodeRef}
      className="leftover-badge"
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ opacity: canDrag ? 1 : 0.9 }}
      title={canDrag ? "Drag to create leftover" : "Set leftovers"}
    >
      {label}
    </button>
  );
}
