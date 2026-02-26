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

