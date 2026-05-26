import { useCallback, useEffect, useMemo, useState } from "react";
import { CookedPortion, Recipe } from "../../models";
import {
  consumeCookedPortion,
  COOKED_PORTIONS_UPDATED_EVENT,
  deleteCookedPortion,
  listActiveCookedPortions
} from "../../db/repositories/cookedPortionsRepo";
import { listRecipes } from "../../db/repositories/recipeRepo";
import { dateKey, parseISODate } from "../../utils/date";

interface Row {
  portion: CookedPortion;
  recipe?: Recipe;
  daysUntil?: number;
}

export default function FridgePanel({ locationId }: { locationId?: string }) {
  const [portions, setPortions] = useState<CookedPortion[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const refresh = useCallback(async () => {
    setPortions(await listActiveCookedPortions(locationId));
    setRecipes(await listRecipes());
  }, [locationId]);

  useEffect(() => {
    refresh();
    window.addEventListener(COOKED_PORTIONS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COOKED_PORTIONS_UPDATED_EVENT, refresh);
  }, [refresh]);

  const rows = useMemo<Row[]>(() => {
    const today = parseISODate(dateKey(new Date()));
    return portions
      .map((portion) => {
        const recipe = recipes.find((r) => r.id === portion.recipeId);
        let daysUntil: number | undefined;
        if (portion.expiresAt) {
          const expiry = parseISODate(portion.expiresAt);
          daysUntil = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        return { portion, recipe, daysUntil };
      })
      .sort((a, b) => {
        const aExp = a.portion.expiresAt || "";
        const bExp = b.portion.expiresAt || "";
        if (aExp && bExp) return aExp.localeCompare(bExp);
        if (aExp) return -1;
        if (bExp) return 1;
        return a.portion.cookedAt.localeCompare(b.portion.cookedAt);
      });
  }, [portions, recipes]);

  if (rows.length === 0) return null;

  return (
    <section className="panel no-print fridge-panel">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>In the fridge</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="fridge-list">
        {rows.map(({ portion, recipe, daysUntil }) => {
          const name = recipe?.title || portion.freeformTitle || "Cooked meal";
          const expired = daysUntil !== undefined && daysUntil < 0;
          const expiringSoon = daysUntil !== undefined && daysUntil >= 0 && daysUntil <= 2;
          return (
            <li key={portion.id} className="fridge-row">
              <div className="fridge-row-main">
                <span className="fridge-name">{name}</span>
                <span className="muted fridge-meta">
                  {portion.servingsRemaining} of {portion.servingsTotal} servings
                  {daysUntil !== undefined &&
                    ` • ${
                      expired
                        ? `expired ${Math.abs(daysUntil)}d ago`
                        : daysUntil === 0
                          ? "expires today"
                          : `${daysUntil}d left`
                    }`}
                </span>
              </div>
              <div className="fridge-row-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void consumeCookedPortion(portion.id, 1)}
                  disabled={portion.servingsRemaining <= 0}
                  title="Eat one serving"
                >
                  Eat 1
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void consumeCookedPortion(portion.id, portion.servingsRemaining)}
                  disabled={portion.servingsRemaining <= 0}
                  title="Eat all remaining"
                >
                  Eat all
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void deleteCookedPortion(portion.id)}
                  title="Discard (didn't eat it)"
                >
                  Toss
                </button>
              </div>
              {(expired || expiringSoon) && (
                <span className={`fridge-flag ${expired ? "expired" : "soon"}`}>
                  {expired ? "Expired" : "Use soon"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
