import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InventoryLot, PantryItem } from "../../models";
import { INVENTORY_UPDATED_EVENT, listActiveLots } from "../../db/repositories/inventoryRepo";
import { listPantryItems } from "../../db/repositories/pantryRepo";
import { addDays, dateKey, parseISODate } from "../../utils/date";

const DEFAULT_WINDOW_DAYS = 7;
const MAX_VISIBLE = 6;

interface ExpiringRow {
  lot: InventoryLot;
  item?: PantryItem;
  daysUntil: number;
  expired: boolean;
}

export default function ExpiringSoon({ locationId }: { locationId?: string }) {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [items, setItems] = useState<PantryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      listActiveLots(locationId).then((next) => {
        if (!cancelled) setLots(next);
      });
      listPantryItems().then((next) => {
        if (!cancelled) setItems(next);
      });
    };
    reload();
    window.addEventListener(INVENTORY_UPDATED_EVENT, reload);
    return () => {
      cancelled = true;
      window.removeEventListener(INVENTORY_UPDATED_EVENT, reload);
    };
  }, [locationId]);

  const rows = useMemo<ExpiringRow[]>(() => {
    const today = parseISODate(dateKey(new Date()));
    const cutoff = addDays(today, DEFAULT_WINDOW_DAYS);
    return lots
      .filter((lot) => lot.expiresAt && lot.quantity > 0)
      .map((lot) => {
        const expiry = parseISODate(lot.expiresAt as string);
        const daysUntil = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          lot,
          item: items.find((p) => p.id === lot.pantryItemId),
          daysUntil,
          expired: daysUntil < 0
        };
      })
      .filter((row) => parseISODate(row.lot.expiresAt as string) <= cutoff)
      .sort((a, b) => (a.lot.expiresAt as string).localeCompare(b.lot.expiresAt as string));
  }, [items, lots]);

  if (rows.length === 0) return null;

  const visible = rows.slice(0, MAX_VISIBLE);
  const overflow = rows.length - visible.length;

  return (
    <section className="panel no-print expiring-soon">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>Use soon</strong>
        <Link className="tag" to="/pantry">
          Open pantry
        </Link>
      </div>
      <ul className="expiring-soon-list">
        {visible.map(({ lot, item, daysUntil, expired }) => (
          <li key={lot.id} className={expired ? "expiring-soon-row expired" : "expiring-soon-row"}>
            <span className="expiring-soon-name">{item?.name || "Item"}</span>
            <span className="muted expiring-soon-qty">
              {lot.quantity} {item?.baseUnit || ""}
            </span>
            <span className={expired ? "expiring-soon-when expired" : "expiring-soon-when"}>
              {expired
                ? `Expired ${Math.abs(daysUntil)}d ago`
                : daysUntil === 0
                  ? "Expires today"
                  : `In ${daysUntil}d`}
            </span>
          </li>
        ))}
      </ul>
      {overflow > 0 && <p className="muted">+{overflow} more expiring soon</p>}
    </section>
  );
}
