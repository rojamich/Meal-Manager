import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { LocationProfile, WeekTemplate } from "../../models";
import { listLocations } from "../../db/repositories/locationRepo";
import { applyWeekTemplateToWeek, listWeekTemplates } from "../../db/repositories/weekTemplateRepo";
import { emptyPantry } from "../../db/repositories/inventoryRepo";
import { generateGroceryList } from "../grocery/generate";
import { setActiveLocationId } from "../locations/activeLocation";
import { addDays, dateKey, parseISODate } from "../../utils/date";

export default function TripSetupModal({
  open,
  initialLocationId,
  initialStartDate,
  onClose
}: {
  open: boolean;
  initialLocationId?: string;
  initialStartDate: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [locationId, setLocationId] = useState(initialLocationId || "");
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [stayDays, setStayDays] = useState(5);
  const [emptyPantryFirst, setEmptyPantryFirst] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listLocations().then(setLocations);
    listWeekTemplates().then((all) => {
      setTemplates(all);
      if (all.length && !templateId) setTemplateId(all[0].id);
    });
    setLocationId(initialLocationId || "");
    setStartDate(initialStartDate);
    setError(null);
    setSubmitting(false);
  }, [open, initialLocationId, initialStartDate]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const endDate = useMemo(() => {
    if (!startDate || !stayDays || stayDays <= 0) return startDate;
    return dateKey(addDays(parseISODate(startDate), Math.max(stayDays - 1, 0)));
  }, [startDate, stayDays]);

  if (!open || typeof document === "undefined") return null;

  async function handleApply() {
    setSubmitting(true);
    setError(null);
    try {
      setActiveLocationId(locationId);
      if (emptyPantryFirst) {
        await emptyPantry(locationId || undefined);
      }
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        const weekStart = startDate;
        const weekEnd = dateKey(addDays(parseISODate(startDate), 6));
        await applyWeekTemplateToWeek(template, weekStart, weekEnd);
      }
      await generateGroceryList({
        startDate,
        endDate,
        expiryBufferDays: 2,
        includeEssentials: true,
        treatPantryAsEmpty: emptyPantryFirst,
        locationId: locationId || undefined,
        stayDays
      });
      onClose();
      navigate("/grocery");
    } catch (err: any) {
      setError(err?.message || "Trip setup failed.");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="confirm-modal" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <h2>New Trip Setup</h2>
        <p className="muted">
          Pick where you are, empty the old pantry if you'd like, drop in a starting week, and we'll generate your first grocery list.
        </p>

        <label className="field-stack">
          <span>Location</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">No location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            checked={emptyPantryFirst}
            onChange={(e) => setEmptyPantryFirst(e.target.checked)}
          />
          {" "}Empty pantry first {locationId ? "(for this location)" : "(all locations)"}
        </label>

        <label className="field-stack">
          <span>Starting week template</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">No template (start blank)</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <label className="field-stack">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field-stack">
            <span>Stay days</span>
            <input
              type="number"
              min="1"
              value={stayDays}
              onChange={(e) => setStayDays(Math.max(Number(e.target.value) || 1, 1))}
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Grocery list will cover {startDate} → {endDate}.
        </p>

        {error && <p style={{ color: "#dc2626" }}>{error}</p>}

        <div className="confirm-modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" onClick={handleApply} disabled={submitting || !startDate}>
            {submitting ? "Setting up…" : "Apply & generate grocery list"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
