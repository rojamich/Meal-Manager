/**
 * Recipe URLs and image URLs are free text — typed by a household member, or arriving in
 * an imported backup. React renders a `javascript:` href with only a console warning, so
 * anything that reaches an `href` or `src` gets its scheme checked first.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** The URL if it is safe to put in an `href`, otherwise undefined. */
export function safeLinkUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? trimmed : undefined;
  } catch {
    // Not absolute. Bare hostnames ("example.com/recipe") are common when typing by hand,
    // so try again as https rather than dropping them.
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
    return undefined;
  }
}

/** The URL if it is safe to put in an `<img src>`. Also allows inline data images. */
export function safeImageUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(trimmed)) return trimmed;
  return safeLinkUrl(trimmed);
}
