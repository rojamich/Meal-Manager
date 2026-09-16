/**
 * Compare display names the way someone reads an alphabetical list: case- and
 * accent-insensitive, so "apple" sits next to "Apple" rather than after "Zucchini".
 *
 * This exists because IndexedDB indexes sort by UTF-16 code unit, which puts every
 * capitalised name ahead of every lowercase one. A Dexie `orderBy("name")` is therefore
 * not the alphabetical order a person expects, and neither is a plain `<` comparison.
 */
export function compareNames(a: string | undefined, b: string | undefined): number {
  // Trimmed first: a stray leading space sorts ahead of every letter, which makes an
  // otherwise correct list look unsorted.
  return (a || "").trim().localeCompare((b || "").trim(), undefined, { sensitivity: "base" });
}
