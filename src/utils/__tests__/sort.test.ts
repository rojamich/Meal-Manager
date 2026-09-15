import { describe, expect, it } from "vitest";
import { compareNames } from "../sort";

const sorted = (names: string[]) => [...names].sort(compareNames);

describe("compareNames", () => {
  it("ignores case, so capitalisation does not jump a name to the front", () => {
    // The bug: IndexedDB's index sorts by code unit, putting every capital ahead of
    // every lowercase letter.
    expect(sorted(["Zucchini", "apple", "Butter", "cheddar"])).toEqual([
      "apple",
      "Butter",
      "cheddar",
      "Zucchini"
    ]);
  });

  it("treats the same name in different cases as equal", () => {
    expect(compareNames("Olive Oil", "olive oil")).toBe(0);
    expect(compareNames("FLOUR", "flour")).toBe(0);
  });

  it("orders mixed-case entries of the same word together", () => {
    expect(sorted(["banana", "Apple", "BANANA", "apple"])).toEqual([
      "Apple",
      "apple",
      "banana",
      "BANANA"
    ]);
  });

  it("ignores accents so they do not sort to the end", () => {
    expect(sorted(["Zest", "Étouffée", "apple"])).toEqual(["apple", "Étouffée", "Zest"]);
  });

  it("handles missing and empty names without throwing", () => {
    expect(compareNames(undefined, "apple")).toBeLessThan(0);
    expect(compareNames("apple", undefined)).toBeGreaterThan(0);
    expect(compareNames(undefined, undefined)).toBe(0);
    expect(compareNames("", "")).toBe(0);
  });

  it("sorts leading whitespace and punctuation predictably", () => {
    const out = sorted(["pepper", "Ancho chile", "ancho chile"]);
    expect(out[0].toLowerCase()).toBe("ancho chile");
    expect(out[2]).toBe("pepper");
  });
});
