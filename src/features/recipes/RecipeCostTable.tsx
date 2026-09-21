import { RecipeCostBreakdown } from "../../utils/mealCost";
import { STALE_PRICE_DAYS, formatPriceAge } from "../../utils/price";

/**
 * Why a recipe costs what it does, ingredient by ingredient.
 *
 * The per-serving figure on its own invites disbelief — packet pricing can make a
 * modest dish look expensive, and the only way to accept the number is to see which
 * ingredient carried it and on what basis. So each line states its unit price, how old
 * that price is, and whether it was charged a whole packet, only what it used, or
 * nothing at all.
 *
 * Shared between the recipe editor and the recipe list so the two can never quietly
 * disagree about the same dish.
 */
export default function RecipeCostTable({
  breakdown,
  currency
}: {
  breakdown: RecipeCostBreakdown;
  currency?: string;
}) {
  const money = (value: number) => `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Qty / serving</th>
            <th>Unit price</th>
            <th>Charged</th>
            <th>Cost / serving</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.lines.map((line) => (
            <tr key={line.key}>
              <td data-label="Ingredient">{line.label}</td>
              <td data-label="Qty / serving">
                {Math.round(line.qtyPerServing * 100) / 100} {line.unit}
              </td>
              <td data-label="Unit price">
                {line.negligible ? (
                  <span className="muted">negligible</span>
                ) : line.unitPrice !== undefined ? (
                  <>
                    {line.unitPrice.toFixed(2)}
                    {line.ageDays !== undefined && (
                      <span
                        className="muted"
                        style={{
                          fontSize: 11,
                          fontWeight: line.ageDays > STALE_PRICE_DAYS ? 600 : 400
                        }}
                      >
                        {" "}
                        · {formatPriceAge(line.ageDays)}
                      </span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td data-label="Charged">
                {line.basis === "negligible" ? (
                  <span className="muted">free</span>
                ) : line.basis === "package" && line.packsCharged ? (
                  <span style={{ fontSize: 12 }}>
                    {line.packsCharged} pack{line.packsCharged === 1 ? "" : "s"} ×{" "}
                    {Math.round((line.packQty ?? 0) * 100) / 100} {line.unit}
                    {line.wastedQty ? (
                      <span className="muted">
                        {" "}
                        · {Math.round(line.wastedQty * 100) / 100} {line.unit} spare
                      </span>
                    ) : null}
                  </span>
                ) : line.basis === "usage" ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    shared — only what it uses
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    loose — no pack size set
                  </span>
                )}
              </td>
              <td data-label="Cost / serving">
                {line.costPerServing !== undefined ? (
                  line.costPerServing.toFixed(2)
                ) : (
                  <span className="muted">no price data</span>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}>
              <strong>Cost to make the whole recipe</strong>
              {breakdown.leftoverCost > 0 && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {" "}
                  · {money(breakdown.leftoverCost)} of that is packet you do not use here
                </span>
              )}
            </td>
            <td data-label="Cost to make">
              <strong>
                {breakdown.costToMake.toFixed(2)}
                {!breakdown.complete && "+"}
              </strong>
            </td>
          </tr>
          <tr>
            <td colSpan={4}>
              <strong>
                Per serving
                {!breakdown.complete &&
                  ` (${breakdown.pricedCount} of ${breakdown.lineCount} ingredients priced)`}
              </strong>
            </td>
            <td data-label="Per serving">
              <strong>
                {breakdown.costPerServing.toFixed(2)}
                {!breakdown.complete && "+"}
              </strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
