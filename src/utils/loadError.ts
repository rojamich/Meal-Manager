export const DATA_LOAD_ERROR_EVENT = "data-load-error";

export interface DataLoadErrorDetail {
  what: string;
}

/**
 * Rejection handler for the page-level data loads. Without one, a failing IndexedDB read
 * (private browsing, quota, a blocked upgrade from another tab) leaves the screen empty
 * and indistinguishable from genuinely having no data.
 *
 * Usage: `listRecipes().then(setRecipes).catch(reportLoadError("recipes"))`
 */
export function reportLoadError(what: string) {
  return (err: unknown) => {
    console.error(`[data] could not load ${what}`, err);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<DataLoadErrorDetail>(DATA_LOAD_ERROR_EVENT, { detail: { what } })
      );
    }
  };
}
