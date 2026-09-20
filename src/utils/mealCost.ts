import { PantryItem, PlannedMeal, PurchaseEntry, Recipe, RecipeIngredient } from "../models";
import { CurrencyRates, STALE_PRICE_DAYS, bestUnitPriceInfo } from "./price";
import { toBaseUnits } from "./packUnits";

/**
 * How an ingredient's cost is charged to a recipe.
 *
 * `package` is the default and the cautious one: buying a 970 g jar to use 200 g costs
 * you the jar. That is the honest number when the rest is likely to be left behind —
 * moving country every few months guarantees it — and it is the number that decides
 * whether cooking really beat going out.
 *
 * `usage` charges only what the recipe takes, and is right for the things genuinely
 * spread over many meals: butter, milk, oil, spices. It is opt-in per item.
 *
 * `loose` is the same arithmetic as `usage` but for a different reason: with nothing
 * sold in fixed packets — mince off the counter, loose onions — you buy what the recipe
 * needs, so there is no packet to round up to.
 */
export type CostBasis = "package" | "usage" | "loose" | "negligible";

export interface RecipeCostLine {
  key: string;
  label: string;
  unit: string;
  qtyPerServing: number;
  /** Total the recipe needs, across all of its base servings. */
  qtyNeeded: number;
  /** Price per base unit from purchase history; undefined = no price data. */
  unitPrice?: number;
  costPerServing?: number;
  /** What this ingredient adds to the cost of making the whole recipe. */
  costToMake?: number;
  /** How this line was charged. */
  basis: CostBasis;
  /** Whole packets charged, when the basis is `package`. */
  packsCharged?: number;
  /** Size of one packet in base units, when known. */
  packQty?: number;
  /** Amount paid for but not used by this recipe. Only meaningful for `package`. */
  wastedQty?: number;
  /** Date of the purchase this price came from. */
  asOf?: string;
  /** How old that purchase is, in days. */
  ageDays?: number;
  /** Salt and the like: counted as priced, at zero. */
  negligible?: boolean;
}

export interface RecipeCostBreakdown {
  lines: RecipeCostLine[];
  pricedCount: number;
  lineCount: number;
  /** What it costs to make the whole recipe, packets and all. */
  costToMake: number;
  /** `costToMake` spread over the recipe's base servings. */
  costPerServing: number;
  /** True when every ingredient line has a price. */
  complete: boolean;
  /** Age of the oldest price behind this figure, for judging how much to trust it. */
  oldestPriceAgeDays?: number;
  /** True when any contributing price is old enough to be worth questioning. */
  hasStalePrices: boolean;
  /**
   * Cost of what gets bought but not used by this recipe — the 770 g left in the jar.
   * Worth showing: it is usually the gap between this and a naive per-gram estimate,
   * and it is the part you avoid by marking an ingredient as shared across meals.
   */
  leftoverCost: number;
  /** Items charged as whole packets where no pack size is on file, so charged loose. */
  unknownPackCount: number;
}

/**
 * Size of one packet of an item, in the item's base units.
 *
 * Returns undefined when nothing is on file, which is the signal that the thing is
 * bought loose and should be charged by what the recipe uses.
 */
export function packQtyFor(item: PantryItem | undefined): number | undefined {
  if (!item?.packSize || item.packSize <= 0) return undefined;
  const qty = toBaseUnits({
    packSize: item.packSize,
    packUnit: item.packUnit,
    baseUnit: item.baseUnit
  });
  return qty !== undefined && qty > 0 ? qty : undefined;
}

/**
 * What it costs to make a recipe, and what one serving of it works out at.
 *
 * The important decision here is that an ingredient costs whatever you had to *buy* to
 * make the dish, not what the dish takes out of the packet. A recipe wanting 200 g from
 * a 970 g jar is charged the jar, because assuming the other 770 g finds a use is an
 * assumption, and a wrong one for anyone who moves often enough to keep abandoning
 * half-full jars. Items marked `sharedAcrossMeals` opt out of that and are charged per
 * gram; anything with no pack size on file is bought loose, and charged the same way.
 *
 * Cost per serving therefore is not linear in servings — doubling a recipe may not need
 * a second jar. So the whole recipe is costed first, at its base servings, and divided
 * afterwards.
 *
 * For alt groups (interchangeable options like "any cheese"), the cheapest priced option
 * is used; if none is priced, the first option stands in.
 */
export function buildRecipeCostBreakdown({
  recipe,
  ingredients,
  pantryItems,
  purchases,
  locationId,
  rates,
  asOfDate,
  annualInflationPct
}: {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  pantryItems: PantryItem[];
  purchases: PurchaseEntry[];
  locationId?: string;
  /** Without this, purchases in other currencies are skipped rather than mixed in. */
  rates?: CurrencyRates;
  /** Day to price as of. Defaults to today. */
  asOfDate?: string;
  /** Active location's annual inflation, used to carry old prices forward. */
  annualInflationPct?: number;
}): RecipeCostBreakdown {
  const baseServings = Math.max(recipe.baseServings ?? recipe.defaultServings ?? 1, 1);
  const itemById = new Map(pantryItems.map((item) => [item.id, item]));
  const priceOptions = { locationId, rates, asOfDate, annualInflationPct };

  const normal: RecipeIngredient[] = [];
  const altGroups = new Map<string, RecipeIngredient[]>();
  for (const ing of ingredients) {
    const group = ing.altGroup?.trim();
    if (!group) {
      normal.push(ing);
    } else {
      altGroups.set(group, [...(altGroups.get(group) ?? []), ing]);
    }
  }

  const lines: RecipeCostLine[] = [];
  const pushLine = (ing: RecipeIngredient, labelPrefix?: string) => {
    const item = itemById.get(ing.pantryItemId);
    const qtyNeeded = ing.quantity;
    const qtyPerServing = qtyNeeded / baseServings;
    const name = item?.name || "Unknown ingredient";
    const label = labelPrefix ? `${labelPrefix}: ${name}` : name;

    // A pinch of salt costs a fraction of a cent. Left unpriced it would hold the whole
    // recipe at "incomplete" forever, which trains you to ignore the warning that is
    // supposed to mean a real ingredient is missing a price.
    if (item?.negligibleCost) {
      lines.push({
        key: ing.id,
        label,
        unit: item.baseUnit,
        qtyPerServing,
        qtyNeeded,
        unitPrice: 0,
        costPerServing: 0,
        costToMake: 0,
        basis: "negligible",
        negligible: true
      });
      return;
    }

    const info = bestUnitPriceInfo(purchases, ing.pantryItemId, priceOptions);
    const packQty = packQtyFor(item);
    // Shared items are charged per gram by choice; loose ones because there is no
    // packet to round up to. Kept apart so the UI can explain which is which.
    const basis: CostBasis = item?.sharedAcrossMeals
      ? "usage"
      : packQty === undefined
        ? "loose"
        : "package";

    if (!info) {
      lines.push({
        key: ing.id,
        label,
        unit: item?.baseUnit || "count",
        qtyPerServing,
        qtyNeeded,
        basis,
        packQty
      });
      return;
    }

    if (basis === "package" && packQty !== undefined) {
      const packsCharged = Math.ceil(qtyNeeded / packQty);
      const chargedQty = packsCharged * packQty;
      const costToMake = chargedQty * info.price;
      lines.push({
        key: ing.id,
        label,
        unit: item?.baseUnit || "count",
        qtyPerServing,
        qtyNeeded,
        unitPrice: info.price,
        costToMake,
        costPerServing: costToMake / baseServings,
        basis,
        packsCharged,
        packQty,
        wastedQty: chargedQty - qtyNeeded,
        asOf: info.asOf,
        ageDays: info.ageDays
      });
      return;
    }

    const costToMake = qtyNeeded * info.price;
    lines.push({
      key: ing.id,
      label,
      unit: item?.baseUnit || "count",
      qtyPerServing,
      qtyNeeded,
      unitPrice: info.price,
      costToMake,
      costPerServing: costToMake / baseServings,
      basis,
      packQty,
      asOf: info.asOf,
      ageDays: info.ageDays
    });
  };

  for (const ing of normal) pushLine(ing);
  for (const [groupLabel, options] of altGroups) {
    // Compared on what each option would actually cost to buy for this recipe, so a
    // cheap-per-gram option only sold in a huge jar does not look like the bargain.
    const priced = options
      .map((opt) => {
        const optItem = itemById.get(opt.pantryItemId);
        if (optItem?.negligibleCost) return { opt, cost: 0 };
        const price = bestUnitPriceInfo(purchases, opt.pantryItemId, priceOptions)?.price;
        if (price === undefined) return { opt, cost: undefined };
        const packQty = packQtyFor(optItem);
        const chargedQty =
          !optItem?.sharedAcrossMeals && packQty !== undefined
            ? Math.ceil(opt.quantity / packQty) * packQty
            : opt.quantity;
        return { opt, cost: chargedQty * price };
      })
      .filter((entry) => entry.cost !== undefined)
      .sort((a, b) => (a.cost as number) - (b.cost as number));
    pushLine(priced[0]?.opt ?? options[0], groupLabel);
  }

  const pricedCount = lines.filter((line) => line.costPerServing !== undefined).length;
  const costToMake = lines.reduce((sum, line) => sum + (line.costToMake ?? 0), 0);
  const leftoverCost = lines.reduce(
    (sum, line) => sum + (line.wastedQty ?? 0) * (line.unitPrice ?? 0),
    0
  );
  const ages = lines
    .map((line) => line.ageDays)
    .filter((age): age is number => age !== undefined);
  const oldestPriceAgeDays = ages.length ? Math.max(...ages) : undefined;

  return {
    lines,
    pricedCount,
    lineCount: lines.length,
    costToMake,
    costPerServing: costToMake / baseServings,
    complete: lines.length > 0 && pricedCount === lines.length,
    oldestPriceAgeDays,
    hasStalePrices: oldestPriceAgeDays !== undefined && oldestPriceAgeDays > STALE_PRICE_DAYS,
    leftoverCost,
    unknownPackCount: lines.filter((line) => line.basis === "loose").length
  };
}

/**
 * Servings each planned meal actually accounts for on its own day.
 *
 * A batch is paid for once but eaten over several days, and the plan is meant to show
 * what each day uses. So a cooked meal is charged only the servings not claimed by
 * leftover meals hanging off it, and each leftover meal is charged the servings it
 * claims. The parts always sum back to the batch, so nothing is counted twice and
 * nothing silently disappears — and planning to eat leftovers stops looking free, which
 * it never was.
 *
 * Every meal is needed to work this out, not only the ones on screen: a leftover eaten
 * next Tuesday still reduces what this Sunday is charged.
 */
export function servingsConsumedByMeal(
  allMeals: PlannedMeal[],
  defaultServings = 1
): Map<string, number> {
  const servingsOf = (meal: PlannedMeal) =>
    Math.max(meal.servingsPlanned ?? defaultServings, 0);

  const claimed = new Map<string, number>();
  for (const meal of allMeals) {
    const sourceId = meal.leftoverSourceMealId;
    if (!sourceId) continue;
    claimed.set(sourceId, (claimed.get(sourceId) ?? 0) + servingsOf(meal));
  }

  const result = new Map<string, number>();
  for (const meal of allMeals) {
    if (meal.leftoverSourceMealId) {
      result.set(meal.id, servingsOf(meal));
      continue;
    }
    result.set(meal.id, Math.max(servingsOf(meal) - (claimed.get(meal.id) ?? 0), 0));
  }
  return result;
}

/**
 * Cost per serving to display for a recipe: computed from price history when
 * at least one ingredient is priced, else the manually entered estimate.
 */
export function effectiveCostPerServing(
  breakdown: RecipeCostBreakdown | undefined,
  recipe: Recipe
): number | undefined {
  if (breakdown && breakdown.pricedCount > 0) return breakdown.costPerServing;
  return recipe.estimatedCostPerServing;
}

/**
 * How a planned meal's cost compares with going out.
 *
 * This is the comparison the whole cost feature exists to support. Cooking to save money
 * stops working somewhere, and without the two numbers side by side that point passes
 * unnoticed — you keep buying ingredients for a meal that costs more than the restaurant.
 *
 * The verdict is always taken **per serving**, never on the batch total. A pot of stew
 * that feeds six costs more than an omelette that feeds one and is not thereby the worse
 * deal; comparing batch totals would recommend cooking small, which is backwards. The
 * batch figures are carried too, because "what did tonight cost" is a fair second
 * question — they just do not decide the verdict.
 */
export interface EatOutComparison {
  costPerServing: number;
  eatOutPerPerson: number;
  servings: number;
  /** Cost of cooking the whole batch. */
  cookTotal: number;
  /** What the same number of people eating out would have cost. */
  eatOutTotal: number;
  /** Per serving. Positive means cooking is dearer than going out. */
  difference: number;
  /** Across the batch. */
  totalDifference: number;
  /** Cooking costs at least as much as eating out, per serving. */
  worseThanEatingOut: boolean;
  /** Within a tenth of the eat-out price — close enough that convenience decides. */
  closeCall: boolean;
}

export function compareWithEatingOut(
  costPerServing: number | undefined,
  eatOutPerPerson: number | undefined,
  servings = 1
): EatOutComparison | undefined {
  if (costPerServing === undefined || !Number.isFinite(costPerServing)) return undefined;
  if (!eatOutPerPerson || !Number.isFinite(eatOutPerPerson) || eatOutPerPerson <= 0) {
    return undefined;
  }
  const portions = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const difference = costPerServing - eatOutPerPerson;
  return {
    costPerServing,
    eatOutPerPerson,
    servings: portions,
    cookTotal: costPerServing * portions,
    eatOutTotal: eatOutPerPerson * portions,
    difference,
    totalDifference: difference * portions,
    worseThanEatingOut: difference >= 0,
    closeCall: Math.abs(difference) <= eatOutPerPerson * 0.1
  };
}

/**
 * Average cost per serving across a set of meals, weighted by servings.
 *
 * A plain mean of per-serving costs would let a single-serving snack pull the week's
 * average as hard as a meal that fed six, which is how a week of cheap family dinners
 * ends up reading as expensive.
 */
export function averageCostPerServing(
  meals: { costPerServing?: number; servings: number }[]
): { average?: number; servings: number } {
  let cost = 0;
  let servings = 0;
  for (const meal of meals) {
    if (meal.costPerServing === undefined) continue;
    const portions = Number.isFinite(meal.servings) && meal.servings > 0 ? meal.servings : 1;
    cost += meal.costPerServing * portions;
    servings += portions;
  }
  return { average: servings > 0 ? cost / servings : undefined, servings };
}
