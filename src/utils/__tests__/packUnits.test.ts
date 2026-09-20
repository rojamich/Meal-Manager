import { describe, expect, it } from "vitest";
import {
  defaultPackUnit,
  packUnitFitsBaseUnit,
  packUnitsForBaseUnit,
  parsePackUnit,
  toBaseUnits
} from "../packUnits";

describe("parsePackUnit", () => {
  it("reads the spellings Argentine receipts use", () => {
    expect(parsePackUnit("GRS")).toBe("g");
    expect(parsePackUnit("GRM")).toBe("g");
    expect(parsePackUnit("GR")).toBe("g");
    expect(parsePackUnit("KGM")).toBe("kg");
    expect(parsePackUnit("CC")).toBe("ml");
    expect(parsePackUnit("LTR")).toBe("l");
    expect(parsePackUnit("UNI")).toBe("count");
    expect(parsePackUnit("U")).toBe("count");
  });

  it("ignores case, accents and trailing punctuation", () => {
    expect(parsePackUnit("grs.")).toBe("g");
    expect(parsePackUnit(" Kg ")).toBe("kg");
    expect(parsePackUnit("LITROS")).toBe("l");
  });

  it("returns undefined for words that are not units", () => {
    expect(parsePackUnit("BULNEZ")).toBeUndefined();
    expect(parsePackUnit("SOBRE")).toBeUndefined();
    expect(parsePackUnit("")).toBeUndefined();
  });
});

describe("toBaseUnits", () => {
  it("converts mass packs to grams", () => {
    expect(toBaseUnits({ packSize: 400, packUnit: "g", baseUnit: "g" })).toBe(400);
    expect(toBaseUnits({ packSize: 1, packUnit: "kg", baseUnit: "g" })).toBe(1000);
    expect(toBaseUnits({ packSize: 0.744, packUnit: "kg", baseUnit: "g" })).toBeCloseTo(744);
  });

  it("converts volume packs to millilitres", () => {
    expect(toBaseUnits({ packSize: 750, packUnit: "ml", baseUnit: "ml" })).toBe(750);
    expect(toBaseUnits({ packSize: 1.5, packUnit: "l", baseUnit: "ml" })).toBe(1500);
  });

  it("multiplies by the number of identical packs", () => {
    expect(toBaseUnits({ packCount: 2, packSize: 100, packUnit: "g", baseUnit: "g" })).toBe(200);
    expect(toBaseUnits({ packCount: 3, packSize: 100, packUnit: "g", baseUnit: "g" })).toBe(300);
  });

  it("handles imperial input, which is the point of having pack units at all", () => {
    expect(toBaseUnits({ packSize: 1, packUnit: "lb", baseUnit: "g" })).toBeCloseTo(453.592);
    expect(toBaseUnits({ packSize: 2.41, packUnit: "lb", baseUnit: "g" })).toBeCloseTo(1093.16, 1);
  });

  it("reads a bare number in whatever unit the item is stored in", () => {
    // "botella x 970" never says grams or millilitres; the pantry item decides.
    expect(toBaseUnits({ packSize: 970, baseUnit: "g" })).toBe(970);
    expect(toBaseUnits({ packSize: 970, baseUnit: "ml" })).toBe(970);
  });

  it("refuses to convert mass to volume, which would need a density", () => {
    expect(toBaseUnits({ packSize: 1, packUnit: "l", baseUnit: "g" })).toBeUndefined();
    expect(toBaseUnits({ packSize: 500, packUnit: "g", baseUnit: "ml" })).toBeUndefined();
    expect(toBaseUnits({ packSize: 6, packUnit: "count", baseUnit: "g" })).toBeUndefined();
  });

  it("rejects sizes that cannot be a quantity", () => {
    expect(toBaseUnits({ packSize: 0, packUnit: "g", baseUnit: "g" })).toBeUndefined();
    expect(toBaseUnits({ packSize: -5, packUnit: "g", baseUnit: "g" })).toBeUndefined();
    expect(toBaseUnits({ packSize: Number.NaN, packUnit: "g", baseUnit: "g" })).toBeUndefined();
  });

  it("treats a missing or zero pack count as one pack", () => {
    expect(toBaseUnits({ packCount: 0, packSize: 400, packUnit: "g", baseUnit: "g" })).toBe(400);
    expect(toBaseUnits({ packSize: 400, packUnit: "g", baseUnit: "g" })).toBe(400);
  });
});

describe("unit options for an item", () => {
  it("offers only units that can express the item's base unit, commonest first", () => {
    expect(packUnitsForBaseUnit("g")).toEqual(["g", "kg", "mg", "oz", "lb"]);
    expect(packUnitsForBaseUnit("ml")).toEqual(["ml", "cl", "l", "floz", "cup"]);
    expect(packUnitsForBaseUnit("count")).toEqual(["count"]);
  });

  it("agrees with packUnitFitsBaseUnit", () => {
    expect(packUnitFitsBaseUnit("kg", "g")).toBe(true);
    expect(packUnitFitsBaseUnit("kg", "ml")).toBe(false);
    expect(packUnitFitsBaseUnit("count", "count")).toBe(true);
  });

  it("defaults to the unit the item is already stored in", () => {
    expect(defaultPackUnit("g")).toBe("g");
    expect(defaultPackUnit("ml")).toBe("ml");
    expect(defaultPackUnit("count")).toBe("count");
  });
});
