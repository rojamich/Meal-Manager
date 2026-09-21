export type BaseUnit = "count" | "g" | "ml";

/**
 * Units a price can be *entered* in. Receipts print "X 400GRS", "1 KGM", "750 CC",
 * "2.41 lb" — nobody should have to convert those to grams by hand before recording a
 * price. These collapse to a BaseUnit via `toBaseUnits` in utils/packUnits.
 */
export type PackUnit =
  | "count"
  | "mg"
  | "g"
  | "kg"
  | "oz"
  | "lb"
  | "ml"
  | "cl"
  | "l"
  | "floz"
  | "cup";
export type StorageType = "pantry" | "fridge" | "freezer";

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  storageType: StorageType;
  baseUnit: BaseUnit;
  /**
   * Other names this same thing goes by — "Suprema", "pechuga", "chicken breast".
   * The point of the pantry item is to be the one canonical thing a price is tracked
   * against, so a Buenos Aires receipt and a US receipt land on the same row and the
   * comparison means something. Aliases are how a locally-named product finds it.
   */
  aliases?: string[];
  /**
   * Salt, tap water, a pinch of pepper. Their per-serving cost rounds to nothing, but
   * left unpriced they hold every recipe at "incomplete" forever. Marked negligible,
   * they count as priced at zero.
   */
  negligibleCost?: boolean;
  /**
   * Whether the rest of the packet will genuinely go into other meals.
   *
   * Off by default, and deliberately so. Charging a recipe only for the 200 g it takes
   * out of a 970 g jar assumes the other 770 g gets eaten — which holds for butter,
   * milk, oil and spices, and does not hold for the jar of something bought for one
   * dish and left behind at the next move. The safer estimate is that a packet bought
   * for a meal was bought *by* that meal, so that is the default, and this flag is how
   * you say otherwise.
   */
  sharedAcrossMeals?: boolean;
  /**
   * The size this is sold in — a 970 g bottle, a 400 g packet, a dozen eggs.
   *
   * Needed to charge whole packets rather than grams. Filled in from the first shopping
   * trip that records a pack for this item, and editable afterwards. Left empty for
   * anything bought loose by weight, where you buy exactly what the recipe needs and
   * rounding up to a packet would invent a cost that does not exist.
   */
  packSize?: number;
  packUnit?: PackUnit;
  defaultShelfLifeDays?: number;
  defaultAfterOpeningDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLot {
  id: string;
  pantryItemId: string;
  quantity: number;
  purchasedAt: string;
  expiresAt?: string;
  locationId?: string;
  archivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  url?: string;
  baseServings: number;
  defaultServings: number;
  mealTypes: string[];
  tags: string[];
  notes?: string;
  steps: string[];
  calories?: number;
  caloriesPerServing?: number;
  proteinGrams?: number;
  timeMinutes?: number;
  estimatedCostPerServing?: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  pantryItemId: string;
  quantity: number;
  altGroup?: string;
  prepNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealSlot {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Person {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
}

export interface CookedPortion {
  id: string;
  recipeId?: string;
  freeformTitle?: string;
  servingsTotal: number;
  servingsRemaining: number;
  cookedAt: string;
  expiresAt?: string;
  locationId?: string;
  sourcePlannedMealId?: string;
  archivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlannedMealType = "recipe" | "freeform" | "leftover";

export interface PlannedMeal {
  id: string;
  date: string;
  mealSlotId: string;
  type: PlannedMealType;
  recipeId?: string;
  sourcePlannedMealId?: string;
  leftoverSourceMealId?: string;
  leftoverServingsRemaining?: number;
  freeformTitle?: string;
  notes?: string;
  servingsPlanned?: number;
  assignedTo?: string;
  cookedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EssentialItem {
  id: string;
  pantryItemId?: string;
  freeformLabel?: string;
  defaultQty?: number;
  category?: string;
  includeWhenPantryEmpty: boolean;
  alwaysInclude: boolean;
  minStayDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationProfile {
  id: string;
  name: string;
  currencyCode: string;
  exchangeRateToUSD?: number;
  /**
   * When `exchangeRateToUSD` was last set. A hand-typed rate quietly goes stale, and a
   * stale rate silently reprices every past purchase, so the age is shown rather than
   * assumed current.
   */
  rateAsOf?: string;
  /**
   * Typical per-person cost of eating out here, in this location's currency. This is the
   * number a planned meal is compared against — the whole point of tracking cost is
   * knowing when cooking has stopped being the cheaper option.
   */
  eatOutCostPerPerson?: number;
  /**
   * Optional annual inflation, percent. Somewhere like Buenos Aires a six-month-old price
   * in local currency is not the price today. When set, old prices are age-adjusted
   * instead of being presented as current.
   */
  annualInflationPct?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One line of one shopping trip.
 *
 * `quantity` (base units) and `totalPrice` (net, actually paid) stay the canonical pair
 * that every cost calculation reads. The fields below them record what the receipt
 * actually said, so a price stays auditable against the paper months later instead of
 * being a number nobody can check.
 */
export interface PurchaseEntry {
  id: string;
  pantryItemId: string;
  /** Base units (g / ml / count), derived from the pack fields when those are present. */
  quantity: number;
  /** What was actually paid, after discounts. Never the shelf price. */
  totalPrice: number;
  currencyCode: string;
  locationId?: string;
  store?: string;
  date: string;
  /** Number of identical packs bought: the 2 in "2 x nueces peladas 100 g". */
  packCount?: number;
  /** Size of one pack in `packUnit`: the 400 in "chorizo x 400 g". */
  packSize?: number;
  packUnit?: PackUnit;
  /** Price before discounts, when the receipt showed one. */
  grossPrice?: number;
  /** Total discount applied to this line, as a positive number. */
  discount?: number;
  /** Groups the lines of a single shopping trip. */
  receiptId?: string;
  /**
   * USD per 1 unit of `currencyCode` on the day of purchase. Frozen deliberately: what a
   * purchase cost in USD that day is a historical fact and must not move when the rate on
   * the location profile is later edited.
   */
  exchangeRateToUSD?: number;
  createdAt: string;
  updatedAt: string;
}

/** One shopping trip. Exists so its lines can be reconciled against the printed total. */
export interface Receipt {
  id: string;
  store?: string;
  locationId?: string;
  currencyCode: string;
  date: string;
  /**
   * USD per 1 unit of `currencyCode` on the day of the trip, frozen at entry.
   *
   * The same rate is stamped onto every line, which is what the cost figures actually
   * read. Keeping it on the trip as well records the snapshot itself: what the currency
   * was worth when this shop happened, visible without opening a line. It is never
   * recalculated — a later rate change belongs to a later trip, not this one.
   */
  exchangeRateToUSD?: number;
  /** Printed total, for reconciliation against the sum of the captured lines. */
  total?: number;
  /** Printed subtotal before promotions, when shown. */
  subtotal?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryList {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  locationId?: string;
  settingsJson: string;
}

export interface GroceryLine {
  id: string;
  groceryListId: string;
  pantryItemId?: string;
  freeformLabel?: string;
  category?: string;
  altGroupLabel?: string;
  altOptionsJson?: string;
  neededQty: number;
  fromPantryQty: number;
  toBuyQty: number;
  unit: BaseUnit;
  usedForJson: string;
  checked: boolean;
}

export interface WeekTemplateMeal {
  mealSlotId: string;
  type: PlannedMealType;
  recipeId?: string;
  sourcePlannedMealId?: string;
  leftoverSourceMealId?: string;
  leftoverServingsRemaining?: number;
  freeformTitle?: string;
  notes?: string;
  servingsPlanned?: number;
}

export interface WeekTemplateDay {
  weekday: number;
  meals: WeekTemplateMeal[];
}

export interface WeekTemplate {
  id: string;
  schemaVersion: number;
  name: string;
  locationId?: string;
  days: WeekTemplateDay[];
  createdAt: string;
}

export interface ExportBundle {
  version: number;
  exportedAt: string;
  data: {
    pantryItems: PantryItem[];
    inventoryLots: InventoryLot[];
    recipes: Recipe[];
    recipeIngredients: RecipeIngredient[];
    mealSlots: MealSlot[];
    plannedMeals: PlannedMeal[];
    people?: Person[];
    essentialItems: EssentialItem[];
    locationProfiles: LocationProfile[];
    purchaseEntries: PurchaseEntry[];
    receipts?: Receipt[];
    groceryLists: GroceryList[];
    groceryLines: GroceryLine[];
    weekTemplates: WeekTemplate[];
    cookedPortions?: CookedPortion[];
  };
}
