import type { GameInfo } from "@shared/gfn";
import genshinImpactWordmarkUrl from "../assets/game-artwork/genshin-impact-wordmark.svg";
import wutheringWavesLogoUrl from "../assets/game-artwork/wuthering-waves-logo.svg";

export type GameArtworkSource = "official-override" | "catalog-logo" | "catalog-box-art" | "catalog-key-art";

interface GameArtworkInput {
  id?: string;
  title?: string;
  shortName?: string;
  imageUrl?: string;
  imageUrlsByType?: Record<string, string[]>;
}

/**
 * Explicit, verified logo overrides for titles whose GFN payload is missing a
 * proper square/logo asset. These are bundled locally so the detail panel can
 * paint the artwork in the first render instead of waiting for another fetch.
 */
const OFFICIAL_LOGO_OVERRIDES: Array<{ aliases: string[]; url: string }> = [
  {
    aliases: ["wuthering waves", "鸣潮", "mingchao"],
    url: wutheringWavesLogoUrl,
  },
  {
    aliases: ["genshin impact", "原神"],
    url: genshinImpactWordmarkUrl,
  },
];

const CATALOG_LOGO_KEYS = [
  "GAME_LOGO",
  "LOGO",
  "GAME_ICON",
  "ICON",
] as const;

const CATALOG_BOX_ART_KEYS = [
  "GAME_BOX_ART",
  "BOX_ART",
] as const;

const CATALOG_KEY_ART_KEYS = [
  "KEY_IMAGE",
  "KEY_ART",
] as const;

function normalizeIdentity(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[：:()[\]{}'"`.,/\\_+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstUsableUrl(values: unknown): string | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.find((value): value is string => (
    typeof value === "string" && value.trim().length > 0
  ));
}

function findOfficialOverride(game: GameArtworkInput): string | undefined {
  const identities = [game.title, game.shortName, game.id]
    .map(normalizeIdentity)
    .filter(Boolean);
  const match = OFFICIAL_LOGO_OVERRIDES.find(({ aliases }) => aliases.some((alias) => {
    const normalizedAlias = normalizeIdentity(alias);
    return identities.some((identity) => identity === normalizedAlias || identity.includes(normalizedAlias));
  }));
  return match?.url;
}

function findCatalogUrl(game: GameArtworkInput, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = firstUsableUrl(game.imageUrlsByType?.[key]);
    if (candidate) return candidate.trim();
  }
  return undefined;
}

/** Return the best square/logo asset without silently reusing a landscape hero. */
export function getGameBoxArtUrl(game: Pick<GameInfo, "id" | "title" | "shortName" | "imageUrl" | "imageUrlsByType">): string | undefined {
  return findOfficialOverride(game)
    || findCatalogUrl(game, CATALOG_LOGO_KEYS)
    || findCatalogUrl(game, CATALOG_BOX_ART_KEYS)
    || findCatalogUrl(game, CATALOG_KEY_ART_KEYS);
}

export function getGameArtworkSource(
  game: Pick<GameInfo, "id" | "title" | "shortName" | "imageUrl" | "imageUrlsByType">,
): GameArtworkSource | undefined {
  if (findOfficialOverride(game)) return "official-override";
  if (findCatalogUrl(game, CATALOG_LOGO_KEYS)) return "catalog-logo";
  if (findCatalogUrl(game, CATALOG_BOX_ART_KEYS)) return "catalog-box-art";
  if (findCatalogUrl(game, CATALOG_KEY_ART_KEYS)) return "catalog-key-art";
  return undefined;
}

/** A lightweight no-image fallback; it is never a catalog poster masquerading as a logo. */
export function getGameArtworkInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/** Preserve a landscape hero for backdrops while keeping square art separate. */
export function getGameHeroArtUrl(
  game: Pick<GameInfo, "heroImageUrl" | "screenshotUrl" | "screenshotUrls" | "imageUrl">,
): string | undefined {
  return game.heroImageUrl?.trim()
    || game.screenshotUrls?.find((value) => value.trim().length > 0)
    || game.screenshotUrl?.trim()
    || game.imageUrl?.trim()
    || undefined;
}
