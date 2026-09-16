import { describe, expect, it } from "vitest";
import { isSameItemName, itemMatchKey, normalizeItemName } from "../itemNames";

describe("normalizeItemName", () => {
  it("capitalises the first letter and tidies whitespace", () => {
    expect(normalizeItemName("onion")).toBe("Onion");
    expect(normalizeItemName("  olive   oil  ")).toBe("Olive oil");
  });

  it("leaves the rest of the name as written", () => {
    // Title-casing would mangle these; lowercasing would mangle proper nouns.
    expect(normalizeItemName("ají molido")).toBe("Ají molido");
    expect(normalizeItemName("Parmesan cheese")).toBe("Parmesan cheese");
    expect(normalizeItemName("queso cremoso")).toBe("Queso cremoso");
  });

  it("handles empty input", () => {
    expect(normalizeItemName("")).toBe("");
    expect(normalizeItemName("   ")).toBe("");
  });
});

describe("itemMatchKey", () => {
  it("collapses case and simple plurals", () => {
    expect(itemMatchKey("Onions")).toBe(itemMatchKey("onion"));
    expect(itemMatchKey("Bell Peppers")).toBe(itemMatchKey("bell pepper"));
    expect(itemMatchKey("Tomatoes")).toBe(itemMatchKey("tomato"));
    expect(itemMatchKey("Garlic cloves")).toBe(itemMatchKey("garlic clove"));
  });

  it("ignores accents and punctuation", () => {
    expect(itemMatchKey("Ají molido")).toBe(itemMatchKey("aji molido"));
    expect(itemMatchKey("Pimentón dulce")).toBe(itemMatchKey("pimenton dulce"));
  });

  it("ignores bracketed asides", () => {
    expect(itemMatchKey("Bell peppers (morrones)")).toBe(itemMatchKey("bell pepper"));
    expect(itemMatchKey("Crushed tomato (tomate triturado)")).toBe(itemMatchKey("Crushed tomatoes"));
  });

  // This one bit for real: a pack asking for "Bay leaf" created a second item beside the
  // "Bay leaves" already in the pantry.
  it("matches -f / -ves plurals", () => {
    expect(itemMatchKey("Bay leaves")).toBe(itemMatchKey("bay leaf"));
    expect(itemMatchKey("Loaves")).toBe(itemMatchKey("loaf"));
    expect(itemMatchKey("Halves")).toBe(itemMatchKey("half"));
    expect(itemMatchKey("Knives")).toBe(itemMatchKey("knife"));
  });

  // The counter-example: cloves is a plain plural of clove, not an f/ves pair. A general
  // -ves rule turned "garlic cloves" into "garlic clof".
  it("does not treat every -ves as an f plural", () => {
    expect(itemMatchKey("Garlic cloves")).toBe("garlic clove");
    expect(itemMatchKey("Olives")).toBe("olive");
    expect(itemMatchKey("Gloves")).toBe("glove");
  });

  it("does not strip an s that is part of the word", () => {
    expect(itemMatchKey("hummus")).toBe("hummus");
    expect(itemMatchKey("couscous")).toBe("couscous");
    expect(itemMatchKey("molasses")).toBe("molasses");
    expect(itemMatchKey("asparagus")).toBe("asparagus");
  });

  it("keeps genuinely different things apart", () => {
    expect(isSameItemName("Ground beef", "Beef stock")).toBe(false);
    expect(isSameItemName("Red onion", "Onion")).toBe(false);
    expect(isSameItemName("Chorizo", "Chicken")).toBe(false);
  });

  it("treats an empty name as matching nothing", () => {
    expect(isSameItemName("", "")).toBe(false);
    expect(isSameItemName("  ", "onion")).toBe(false);
  });
});
