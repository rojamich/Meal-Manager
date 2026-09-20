/**
 * Pantry item names are typed by hand across months, so the same thing arrives as
 * "onion", "Onions" and "Onion ". Two helpers keep that under control:
 *
 * - `normalizeItemName` decides how a name is stored and shown.
 * - `itemMatchKey` decides whether two names mean the same thing.
 *
 * They are deliberately separate: display should preserve how you write a word, matching
 * should ignore everything that doesn't change the meaning.
 */

/**
 * Display form: trimmed, inner whitespace collapsed, first letter capitalised.
 *
 * Only the first letter is touched. Title-casing would wreck "Ají molido" → "Ají Molido"
 * and lowercasing would wreck brand and place names, so the rest is left as written.
 */
export function normalizeItemName(raw: string): string {
  const collapsed = (raw || "").trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  return collapsed.charAt(0).toLocaleUpperCase() + collapsed.slice(1);
}

/** Words that end in "s" without being plural. */
const NOT_PLURAL = new Set([
  "hummus",
  "couscous",
  "molasses",
  "asparagus",
  "watercress",
  "greens",
  "oats",
  "grits",
  "chips",
  "crisps"
]);

/**
 * -ves plurals have to be listed rather than derived. English uses the same ending for
 * both patterns — "leaves" comes from leaf, "cloves" from clove — so a rule that rewrites
 * every -ves turned garlic cloves into "clof".
 */
const F_PLURALS = new Map([
  ["leaves", "leaf"],
  ["loaves", "loaf"],
  ["halves", "half"],
  ["knives", "knife"],
  ["shelves", "shelf"],
  ["calves", "calf"],
  ["hooves", "hoof"]
]);

function singularize(word: string): string {
  const irregular = F_PLURALS.get(word);
  if (irregular) return irregular;
  if (word.length <= 3 || NOT_PLURAL.has(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  // potatoes → potato, tomatoes → tomato (a bare "s" strip would leave "tomatoe").
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("ss") || word.endsWith("us")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Comparison key. Two names sharing a key are treated as the same pantry item.
 *
 * Ignores case, accents, punctuation, bracketed asides ("Bell peppers (morrones)") and
 * simple plurals, so "Onions", "onion" and "ONION" all collapse together.
 */
export function itemMatchKey(raw: string): string {
  const withoutBrackets = (raw || "").replace(/\([^)]*\)/g, " ");
  const deaccented = withoutBrackets.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = deaccented
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize);
  return words.join(" ");
}

/** True when two names refer to the same thing for pantry purposes. */
export function isSameItemName(a: string, b: string): boolean {
  const keyA = itemMatchKey(a);
  return keyA.length > 0 && keyA === itemMatchKey(b);
}

/**
 * Find an item by its own name or by any name you have taught it.
 *
 * This is what stops price history fragmenting by place. A Buenos Aires receipt says
 * "Suprema" and a US one says "Chicken breast"; recorded as two pantry items you get two
 * short, separate price histories and no comparison at all. Recorded against one item
 * with an alias, you get the thing you actually wanted: the same ingredient, priced in
 * two places.
 */
export function findByNameOrAlias<T extends { name: string; aliases?: string[] }>(
  items: T[],
  text: string
): T | undefined {
  const key = itemMatchKey(text);
  if (!key) return undefined;
  // The item's own name wins over someone else's alias for the same word.
  const byName = items.find((item) => itemMatchKey(item.name) === key);
  if (byName) return byName;
  return items.find((item) => (item.aliases ?? []).some((alias) => itemMatchKey(alias) === key));
}

/** True when `text` is already recorded for this item, as its name or as an alias. */
export function alreadyKnownAs(
  item: { name: string; aliases?: string[] },
  text: string
): boolean {
  const key = itemMatchKey(text);
  if (!key) return true;
  if (itemMatchKey(item.name) === key) return true;
  return (item.aliases ?? []).some((alias) => itemMatchKey(alias) === key);
}
