import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

export interface ConfirmChoiceOption {
  label: string;
  value: string;
  tone?: "primary" | "neutral" | "danger";
}

export interface ConfirmChoiceModalProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;
  choices: ConfirmChoiceOption[];
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export default function ConfirmChoiceModal({
  open,
  title,
  message,
  detail,
  choices,
  onSelect,
  onCancel
}: ConfirmChoiceModalProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const primaryIndex = useMemo(
    () => Math.max(choices.findIndex((choice) => choice.tone === "primary"), 0),
    [choices]
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    const target = buttonRefs.current[primaryIndex] || buttonRefs.current[0];
    target?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open, primaryIndex]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="confirm-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      role="presentation"
    >
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <h2 id="confirm-modal-title">{title}</h2>
        <p className="confirm-modal-message">{message}</p>
        {detail && <p className="muted confirm-modal-detail">{detail}</p>}
        <div className="confirm-modal-actions">
          {choices.map((choice, index) => (
            <button
              key={`${choice.value}-${choice.label}`}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              className={
                choice.tone === "danger"
                  ? "danger"
                  : choice.tone === "neutral"
                    ? "secondary"
                    : undefined
              }
              onClick={() => onSelect(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
