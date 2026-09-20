export const PANTRY_CATEGORY_OPTIONS = [
  { key: "produce", label: "Produce" },
  { key: "dairy", label: "Dairy" },
  { key: "protein_fresh", label: "Protein (fresh)" },
  { key: "protein_frozen", label: "Protein (frozen)" },
  { key: "pantry_dry", label: "Pantry (dry)" },
  { key: "pantry_canned_jarred", label: "Pantry (canned/jarred)" },
  { key: "spices", label: "Spices" },
  { key: "bakery", label: "Bakery" },
  { key: "frozen", label: "Frozen" },
  { key: "condiments", label: "Condiments" },
  { key: "other", label: "Other" }
] as const;

const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  protein: "protein_fresh",
  freezer: "frozen",
  pantry: "pantry_dry"
};

const CATEGORY_LABELS = new Map<string, string>(PANTRY_CATEGORY_OPTIONS.map((option) => [option.key, option.label]));

export function normalizePantryCategoryKey(value?: string) {
  if (!value) return "other";
  return LEGACY_CATEGORY_ALIASES[value] || value;
}

export function pantryCategoryLabel(value?: string) {
  const normalized = normalizePantryCategoryKey(value);
  return CATEGORY_LABELS.get(normalized) || "Other";
}


/**
 * Position of a category in the order you actually walk a shop: fresh perimeter first,
 * then the centre aisles, then frozen on the way to the till, with anything unrecognised
 * last. PANTRY_CATEGORY_OPTIONS is declared in that order, so this just reads its index.
 *
 * Sorting grocery sections by their raw key instead gave alphabetical-by-database-name
 * ("bakery, condiments, dairy, frozen, other, pantry_canned_jarred, …"), which zigzags the
 * shop and buries "Other" in the middle.
 */
const CATEGORY_ORDER = new Map<string, number>(
  PANTRY_CATEGORY_OPTIONS.map((option, index) => [option.key, index])
);

export function pantryCategorySortIndex(value?: string) {
  const normalized = normalizePantryCategoryKey(value);
  return CATEGORY_ORDER.get(normalized) ?? CATEGORY_ORDER.size;
}

/**
 * Categories whose contents are, by their nature, spread over many meals.
 *
 * A jar of paprika or a bottle of oil lasts months, so charging a recipe the whole
 * bottle — the safe default everywhere else — is wrong here by a wide margin, and wrong
 * on exactly the ingredients that appear in the most recipes. Defaulting these to shared
 * is what stops a first week of costs reading as nonsense before anyone has swept the
 * coverage list.
 *
 * Only a default. It is a plain checkbox on the pantry item afterwards.
 */
const SHARED_BY_DEFAULT = new Set(["spices", "condiments"]);

export function defaultSharedAcrossMeals(category?: string): boolean {
  return SHARED_BY_DEFAULT.has(normalizePantryCategoryKey(category));
}
