import type { GameInfo } from "@shared/gfn";
import wutheringWavesSquareUrl from "../assets/game-artwork/wuthering-waves-square.png";

export type GameArtworkSource = "local-key-art" | "catalog-icon" | "catalog-box-art" | "catalog-key-art";

interface GameArtworkInput {
  id?: string;
  title?: string;
  shortName?: string;
  imageUrlsByType?: Record<string, string[]>;
}

const LOCAL_GAME_ARTWORK: Array<{ aliases: string[]; url: string }> = [
  {
    aliases: ["wuthering waves", "mingchao", "鸣潮"],
    url: wutheringWavesSquareUrl,
  },
];

function normalizeIdentity(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[：:()[\]{}'"`.,/\\_+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLocalArtwork(game: GameArtworkInput): string | undefined {
  const identities = [game.title, game.shortName, game.id]
    .map(normalizeIdentity)
    .filter(Boolean);
  return LOCAL_GAME_ARTWORK.find(({ aliases }) => aliases.some((alias) => {
    const normalizedAlias = normalizeIdentity(alias);
    return identities.some((identity) => identity === normalizedAlias || identity.includes(normalizedAlias));
  }))?.url;
}

/*
 * These are ordered by visual meaning, not by the presence of a text logo:
 * a per-game icon is the closest match to the square artwork used by the
 * client, followed by the provider's box/key art. Text wordmarks are never
 * used as square cover art.
 */
const CATALOG_ICON_KEYS = [
  "GAME_ICON",
  "ICON",
  "APP_ICON",
] as const;

const CATALOG_BOX_ART_KEYS = [
  "GAME_BOX_ART",
  "BOX_ART",
] as const;

const CATALOG_KEY_ART_KEYS = [
  "KEY_IMAGE",
  "KEY_ART",
] as const;


function firstUsableUrl(values: unknown): string | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.find((value): value is string => (
    typeof value === "string" && value.trim().length > 0
  ));
}

function findCatalogUrl(game: GameArtworkInput, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = firstUsableUrl(game.imageUrlsByType?.[key]);
    if (candidate) return candidate.trim();
  }
  return undefined;
}

/**
 * Return the provider artwork that belongs to this title. Never reuse a
 * landscape hero/imageUrl here, and never inject one bundled image for every
 * title. Each game therefore keeps its own icon/box/key artwork identity.
 */
export function getGameBoxArtUrl(
  game: Pick<GameInfo, "id" | "title" | "shortName" | "imageUrlsByType">,
): string | undefined {
  return findLocalArtwork(game)
    || findCatalogUrl(game, CATALOG_ICON_KEYS)
    || findCatalogUrl(game, CATALOG_BOX_ART_KEYS)
    || findCatalogUrl(game, CATALOG_KEY_ART_KEYS);
}

export function getGameArtworkSource(
  game: Pick<GameInfo, "id" | "title" | "shortName" | "imageUrlsByType">,
): GameArtworkSource | undefined {
  if (findLocalArtwork(game)) return "local-key-art";
  if (findCatalogUrl(game, CATALOG_ICON_KEYS)) return "catalog-icon";
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
