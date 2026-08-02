type TranslateFunction = typeof import("../i18n").t;

/**
 * GFN serves the catalog sort definitions with English labels baked in, so the
 * dropdown stayed English no matter which app language was selected. Map the
 * known sort ids (and their English labels, as a safety net) onto locale keys
 * and fall back to whatever the server sent for anything unrecognised.
 */
const SORT_KEY_BY_ID: Record<string, string> = {
  relevance: "sort.relevance",
  mostpopular: "sort.mostPopular",
  popularity: "sort.mostPopular",
  popular: "sort.mostPopular",
  trending: "sort.trending",
  alphabetical: "sort.alphabetical",
  alphabeticalasc: "sort.alphabetical",
  name: "sort.alphabetical",
  sortname: "sort.alphabetical",
  releasedate: "sort.releaseDate",
  newlyadded: "sort.newlyAdded",
  recentlyadded: "sort.newlyAdded",
  dateadded: "sort.newlyAdded",
  lastplayed: "sort.lastPlayed",
  recentlyplayed: "sort.lastPlayed",
  playtime: "sort.playtime",
  rating: "sort.rating",
};

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function formatSortLabel(
  t: TranslateFunction,
  id: string,
  serverLabel: string,
): string {
  const key = SORT_KEY_BY_ID[normalize(id)] ?? SORT_KEY_BY_ID[normalize(serverLabel)];
  if (!key) return serverLabel;
  const translated = t(key);
  // t() echoes the key back when the active locale is missing the entry.
  return translated === key ? serverLabel : translated;
}
