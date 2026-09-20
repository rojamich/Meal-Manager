import { useState } from "react";
import { PlanCostAnalysis } from "./useMealCosts";
import { formatDateLabel } from "../../utils/date";

/**
 * What the plan in front of you costs, and when it stops being worth cooking.
 *
 * The recipes page can already tell you what one recipe costs per serving, but that is
 * not the question you are actually asking. The question is whether *this week*, as
 * planned, is worth the shopping — and whether any particular night has quietly become
 * more expensive than walking to a restaurant.
 *
 * Meals with no priced ingredients are counted separately rather than as zero. A week
 * total that silently treats unknown as free reads as reassuring and is simply wrong.
 *
 * Each day is charged what it *consumes*, so a batch cooked on Sunday and finished on
 * Wednesday shows up across those days rather than landing entirely on Sunday. The
 * shares always add back up to the batch.
 */
export default function PlanCostPanel({ analysis }: { analysis: PlanCostAnalysis }) {
  const [open, setOpen] = useState(false);
  const currency = analysis.currency;
  const eatOut = analysis.eatOut;

  const money = (value: number) => `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;

  if (analysis.pricedMeals === 0 && analysis.unpricedMeals === 0) return null;

  return (
    <section className="panel">
      <div className="row resource-toolbar" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          Plan cost: {analysis.pricedMeals > 0 ? money(analysis.weekTotal) : "—"}
        </h2>
        <button type="button" className="secondary" onClick={() => setOpen((prev) => !prev)}>
          {open ? "Hide detail" : "Show detail"}
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {analysis.avgPerServing !== undefined && (
          <>
            <strong>{money(analysis.avgPerServing)}</strong> a serving across{" "}
            {analysis.totalServings} serving{analysis.totalServings === 1 ? "" : "s"}
            {analysis.eatOutEquivalent !== undefined && (
              <> · eating out for the same {analysis.totalServings} would be about{" "}
              {money(analysis.eatOutEquivalent)}</>
            )}
            {" · "}
          </>
        )}
        {analysis.pricedMeals} meal{analysis.pricedMeals === 1 ? "" : "s"} priced
        {analysis.unpricedMeals > 0 && (
          <>
            {" · "}
            <strong>{analysis.unpricedMeals}</strong> not priced yet, so the real total is higher
          </>
        )}
        {!eatOut && (
          <>
            {" · "}set an eating-out cost on this location to see when cooking stops being cheaper
          </>
        )}
      </p>

      {analysis.dearer.length > 0 && eatOut !== undefined && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>Costs more than eating out</strong> (about {money(eatOut)} a head here),
            compared serving for serving:{" "}
            {analysis.dearer
              .map((row) => `${row.title} at ${row.costPerServing?.toFixed(2)} a serving`)
              .join(", ")}
          </p>
        </div>
      )}

      {open && (
        <>
        <p className="muted" style={{ fontSize: 12 }}>
          Whether a meal beats eating out is decided per serving, not on the batch total —
          a pot that feeds six costs more than an omelette and is not the worse deal for it.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Meal</th>
              <th>Servings eaten</th>
              <th>Per serving</th>
              <th>Batch total</th>
              <th>Eating out, same servings</th>
            </tr>
          </thead>
          <tbody>
            {analysis.dayTotals
              .filter((entry) => entry.rows.length > 0)
              .map((entry) =>
                entry.rows.map((row, index) => (
                  <tr key={row.meal.id}>
                    <td data-label="Day">{index === 0 ? formatDateLabel(entry.day) : ""}</td>
                    <td data-label="Meal">
                      {row.title}
                      {row.dearerThanEatingOut && (
                        <span className="muted" style={{ fontSize: 11 }}> · dearer than eating out</span>
                      )}
                    </td>
                    <td data-label="Servings eaten">{row.servings}</td>
                    <td data-label="Per serving">
                      <strong>
                        {row.costPerServing !== undefined ? row.costPerServing.toFixed(2) : "—"}
                      </strong>
                    </td>
                    <td data-label="Batch total">
                      {row.total !== undefined ? row.total.toFixed(2) : "—"}
                    </td>
                    <td data-label="Eating out, same servings">
                      {row.eatOutTotal !== undefined ? row.eatOutTotal.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
        </>
      )}
    </section>
  );
}
