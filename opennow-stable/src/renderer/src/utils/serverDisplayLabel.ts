import type { PrintedWasteServerMapping } from "@shared/gfn";

/** Decode only presentation text; routing identifiers are never rewritten by this helper. */
export function decodeServerText(value: string | undefined): string | null {
  if (!value) return null;
  let decoded = value.trim();
  for (let attempt = 0; attempt < 2 && /%[0-9a-f]{2}/i.test(decoded); attempt += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
  }
  const cleaned = decoded.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * A user-facing server label must not expose transport addresses or opaque
 * PrintedWaste/GFN identifiers. Return null for unsafe text rather than trying
 * to make a technical value look friendly.
 */
export function sanitizeReadableServerLabel(value: string | undefined): string | null {
  if (!value) return null;
  const decoded = decodeServerText(value);
  if (!decoded || decoded.length > 96) return null;
  if (/[<>[\]{}\\]/.test(decoded)) return null;
  if (/^(?:https?|wss?):\/\//i.test(decoded) || /\b(?:https?|wss?):\/\//i.test(decoded)) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(decoded)) return null;
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?$/i.test(decoded)) return null;
  if (/\b(?:NP|NPA|PN)[-_][A-Z0-9]/i.test(decoded)) return null;
  if (/\b(?:cloudmatch|geforcenow|nvidiagrid)\b/i.test(decoded)) return null;
  return decoded;
}

export function buildServerDisplayLabel(
  zoneId: string,
  pwRegion: string,
  mapping: PrintedWasteServerMapping,
  fallbackRegionLabel: string,
): string {
  const metadata = mapping[zoneId];
  const title = sanitizeReadableServerLabel(metadata?.title);
  const region = sanitizeReadableServerLabel(metadata?.region) ?? sanitizeReadableServerLabel(fallbackRegionLabel);

  if (title && region && title.toLocaleLowerCase() !== region.toLocaleLowerCase()) {
    return `${title} · ${region}`;
  }
  return title ?? region ?? "Máy chủ khả dụng";
}
