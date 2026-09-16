import { describe, expect, it } from "vitest";
import { safeImageUrl, safeLinkUrl } from "../url";

describe("safeLinkUrl", () => {
  it("passes http and https through untouched", () => {
    expect(safeLinkUrl("https://example.com/recipe")).toBe("https://example.com/recipe");
    expect(safeLinkUrl("http://example.com")).toBe("http://example.com");
  });

  // React only warns about these and still renders them, so they have to be stopped here.
  it("rejects script-bearing schemes", () => {
    expect(safeLinkUrl("javascript:alert(document.cookie)")).toBeUndefined();
    expect(safeLinkUrl("JaVaScRiPt:alert(1)")).toBeUndefined();
    expect(safeLinkUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeLinkUrl("vbscript:msgbox(1)")).toBeUndefined();
  });

  it("upgrades a bare hostname rather than dropping it", () => {
    expect(safeLinkUrl("example.com/recipe")).toBe("https://example.com/recipe");
  });

  it("ignores empty and whitespace values", () => {
    expect(safeLinkUrl("")).toBeUndefined();
    expect(safeLinkUrl("   ")).toBeUndefined();
    expect(safeLinkUrl(undefined)).toBeUndefined();
  });
});

describe("safeImageUrl", () => {
  it("allows inline image data but not inline html", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(safeImageUrl(png)).toBe(png);
    expect(safeImageUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeUndefined();
  });

  it("rejects javascript urls", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBeUndefined();
  });
});
