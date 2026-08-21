import type { GameInfo } from "@shared/gfn";

/**
 * Artwork keys emitted by the GFN catalog. GAME_BOX_ART is the preferred
 * square/portrait asset; the remaining keys are safe fallbacks used by
 * different catalog generations.
 */
const BOX_ART_KEYS = [
  "GAME_BOX_ART",
  "BOX_ART",
  "KEY_IMAGE",
  "KEY_ART",
  "GAME_LOGO",
  "LOGO",
  "ICON",
  "GAME_ICON",
] as const;

function firstUsableUrl(values: unknown): string | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.find((value): value is string => (
    typeof value === "string" && value.trim().length > 0
  ));
}

/** Prefer official square/box artwork already supplied by the provider catalog. */
export function getGameBoxArtUrl(game: Pick<GameInfo, "imageUrl" | "imageUrlsByType">): string | undefined {
  for (const key of BOX_ART_KEYS) {
    const candidate = firstUsableUrl(game.imageUrlsByType?.[key]);
    if (candidate) return candidate;
  }

  // imageUrl is the catalog's canonical poster and is a better fallback than
  // a blurred/generated image when a title has no explicit GAME_BOX_ART key.
  return game.imageUrl?.trim() || undefined;
}

/** Preserve a landscape hero for backdrops while keeping the square art separate. */
export function getGameHeroArtUrl(
  game: Pick<GameInfo, "heroImageUrl" | "screenshotUrl" | "screenshotUrls" | "imageUrl">,
): string | undefined {
  return game.heroImageUrl?.trim()
    || game.screenshotUrls?.find((value) => value.trim().length > 0)
    || game.screenshotUrl?.trim()
    || game.imageUrl?.trim()
    || undefined;
}
