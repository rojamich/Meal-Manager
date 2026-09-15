import { describe, expect, it } from "vitest";
import {
  normalizePantryCategoryKey,
  pantryCategoryLabel,
  pantryCategorySortIndex
} from "../pantryCategories";

const byWalk = (keys: string[]) =>
  [...keys].sort((a, b) => pantryCategorySortIndex(a) - pantryCategorySortIndex(b));

describe("pantryCategorySortIndex", () => {
  it("orders sections as you walk a shop, not alphabetically by key", () => {
    const shuffled = ["condiments", "produce", "frozen", "dairy", "pantry_dry", "protein_fresh"];
    expect(byWalk(shuffled)).toEqual([
      "produce",
      "dairy",
      "protein_fresh",
      "pantry_dry",
      "frozen",
      "condiments"
    ]);
  });

  it("keeps unrecognised and 'other' categories at the end", () => {
    const out = byWalk(["other", "produce", "made_up_category", "dairy"]);
    expect(out[0]).toBe("produce");
    expect(out[1]).toBe("dairy");
    expect(out.slice(2)).toContain("other");
    expect(out.slice(2)).toContain("made_up_category");
  });

  // Legacy keys have to fold into their current section, or the list shows two
  // identically-labelled headings.
  it("places legacy keys with their modern equivalent", () => {
    expect(pantryCategorySortIndex("pantry")).toBe(pantryCategorySortIndex("pantry_dry"));
    expect(pantryCategorySortIndex("protein")).toBe(pantryCategorySortIndex("protein_fresh"));
    expect(pantryCategorySortIndex("freezer")).toBe(pantryCategorySortIndex("frozen"));
  });
});

describe("normalizePantryCategoryKey", () => {
  it("maps legacy aliases and defaults to other", () => {
    expect(normalizePantryCategoryKey("pantry")).toBe("pantry_dry");
    expect(normalizePantryCategoryKey(undefined)).toBe("other");
    expect(normalizePantryCategoryKey("produce")).toBe("produce");
  });

  it("gives legacy and modern keys the same label", () => {
    expect(pantryCategoryLabel("freezer")).toBe(pantryCategoryLabel("frozen"));
  });
});
