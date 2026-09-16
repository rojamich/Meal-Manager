import { describe, expect, it } from "vitest";
import { stripUndefined } from "../syncEngine";

/** Every `undefined` left anywhere in the tree, by path. */
function findUndefined(value: unknown, path = ""): string[] {
  if (value === undefined) return [path || "<root>"];
  if (Array.isArray(value)) return value.flatMap((v, i) => findUndefined(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => findUndefined(v, `${path}.${k}`));
  }
  return [];
}

describe("stripUndefined", () => {
  it("drops undefined at the top level", () => {
    expect(stripUndefined({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("keeps null, 0, empty string and false", () => {
    expect(stripUndefined({ a: null, b: 0, c: "", d: false })).toEqual({
      a: null,
      b: 0,
      c: "",
      d: false
    });
  });

  // The defect this guards: Firestore rejects undefined at ANY depth, and a shallow strip
  // meant saving a week template threw and the write was dropped.
  it("drops undefined nested inside arrays of objects", () => {
    const template = {
      id: "tpl",
      name: "Weeknights",
      locationId: undefined,
      days: [
        {
          weekday: 0,
          meals: [
            { mealSlotId: "dinner", type: "recipe", recipeId: "r1", notes: undefined },
            { mealSlotId: "lunch", type: "freeform", recipeId: undefined, freeformTitle: "Soup" }
          ]
        },
        { weekday: 1, meals: [] }
      ]
    };

    const out = stripUndefined(template);

    expect(findUndefined(out)).toEqual([]);
    expect(out.days).toHaveLength(2);
    expect(out.days[0].meals[0]).toEqual({ mealSlotId: "dinner", type: "recipe", recipeId: "r1" });
    expect(out.days[0].meals[1]).toEqual({
      mealSlotId: "lunch",
      type: "freeform",
      freeformTitle: "Soup"
    });
  });

  it("does not leave holes when an array element is undefined", () => {
    const out = stripUndefined({ items: ["a", undefined, "b"] });
    expect(out.items).toEqual(["a", "b"]);
    expect(out.items.every((v: unknown) => v !== undefined)).toBe(true);
  });

  it("leaves non-plain objects alone so Dates survive", () => {
    const date = new Date("2026-08-28T00:00:00.000Z");
    expect(stripUndefined({ when: date }).when).toBe(date);
  });

  it("passes primitives through", () => {
    expect(stripUndefined("x")).toBe("x");
    expect(stripUndefined(3)).toBe(3);
    expect(stripUndefined(null)).toBe(null);
  });
});
