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

  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Send focus back where it came from when the dialog closes.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      // Keep Tab inside the dialog — without this it walks straight out into the page
      // behind, which is still fully interactive.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const target = buttonRefs.current[primaryIndex] || buttonRefs.current[0];
    target?.focus();

    // Stop the page behind from scrolling under the backdrop.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
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
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        <h2 id="confirm-modal-title">{title}</h2>
        <p className="confirm-modal-message" id="confirm-modal-message">{message}</p>
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
