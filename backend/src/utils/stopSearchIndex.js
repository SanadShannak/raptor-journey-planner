const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const serverConfig = require("../serverConfig");
const describeStop = require("./describeStop");
const { getCache } = require("../../memoryCache");

const cache = getCache();

/*
 * Stop names in other languages, from the pipeline's translations component:
 * `{ "<gtfs stop id>": { "<language>": "<name>" } }`.
 *
 * Optional, and read here rather than through `memoryCache.js` so that adding
 * it touched nothing the planner depends on. Absent — a feed with no
 * translations.txt, or data compiled before the component existed — means
 * every stop is searched by the feed's own name alone.
 */
const translationsPath = path.join(
  __dirname,
  `../../../processed-data/${serverConfig.ACTIVE_NETWORK}-processed-data/stop-translations.processed.json`,
);

function loadTranslations() {
  if (!fs.existsSync(translationsPath)) {
    logger.info("stopTranslations: stop-translations.processed.json not present for this network");
    return {};
  }
  try {
    const translations = JSON.parse(fs.readFileSync(translationsPath));
    logger.info(`stopTranslations: Read ${Object.keys(translations).length} entries`);
    return translations;
  } catch (error) {
    // Unreadable is treated as absent, as memoryCache treats its optional files.
    logger.warn(`stopTranslations: unreadable — ${error.message}`);
    return {};
  }
}

/**
 * Folds a name or a query to the form both are compared in.
 *
 * Case and accents go, so "Sweileh" finds "Swéileh". For Arabic, the letters
 * people type interchangeably are made one — the hamza-carrying alefs, alef
 * maqsura and ya, ta marbuta and ha — and the short-vowel marks and the
 * tatweel stretcher are dropped, so "محطة" finds "مَحَطَّه". Punctuation
 * becomes a space, which is what splits words.
 */
function normalise(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/*
 * One entry per stop something calls at — the rule `/api/stops` applies, for
 * the same reason: a stop no vehicle serves is not a place to travel from.
 * Each carries every name it is known by, already folded.
 */
const translations = loadTranslations();
const entries = [];

for (const stop of cache.stops) {
  if (!stop) continue;
  const routeIds = cache.stopToRoutes[stop.id] ?? [];
  if (routeIds.length === 0) continue;

  const modes = new Set();
  for (const routeId of routeIds) {
    const routeType = cache.routes[routeId]?.route_type;
    if (typeof routeType === "number") modes.add(routeType);
  }

  const names = [stop.name, ...Object.values(translations[stop.gtfs_id] ?? {})];
  entries.push({
    internalId: stop.id,
    gtfsId: stop.gtfs_id,
    routeCount: routeIds.length,
    modes: [...modes].sort((a, b) => a - b),
    searchable: names.map((name) => {
      const folded = normalise(name);
      return { folded, words: folded.split(" ") };
    }),
  });
}

logger.info(`stopSearchIndex: ${entries.length} searchable stops`);

/**
 * How well one name answers the query: lower is better, null is no match.
 *
 * Every word typed must begin some word of the name, in any order, so
 * "jeish 3" finds "Al Jeish St.3" and the last word can still be half typed.
 * A name that begins with the whole query ranks first, then one where the
 * first typed word begins the name, then the rest.
 */
function rankName({ folded, words }, query, queryWords) {
  const matchesAll = queryWords.every((typed) =>
    words.some((word) => word.startsWith(typed)),
  );
  if (!matchesAll) return null;
  if (folded.startsWith(query)) return 0;
  if (words[0].startsWith(queryWords[0])) return 1;
  return 2;
}

/**
 * The stops whose name, in any language the feed carries, matches the query —
 * best first, then busiest first (more lines calling), then shortest name.
 */
function searchStops(query, limit) {
  const folded = normalise(query);
  if (folded === "") return { stops: [], truncated: false };
  const queryWords = folded.split(" ");

  const matches = [];
  for (const entry of entries) {
    let best = null;
    let bestLength = Infinity;
    for (const name of entry.searchable) {
      const rank = rankName(name, folded, queryWords);
      if (rank === null) continue;
      if (best === null || rank < best || (rank === best && name.folded.length < bestLength)) {
        best = rank;
        bestLength = name.folded.length;
      }
    }
    if (best !== null) matches.push({ entry, rank: best, length: bestLength });
  }

  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.entry.routeCount - a.entry.routeCount ||
      a.length - b.length,
  );

  const stops = matches.slice(0, limit).map(({ entry }) => ({
    ...describeStop(entry.internalId),
    modes: entry.modes,
    translations: translations[entry.gtfsId] ?? {},
  }));

  return { stops, truncated: matches.length > limit };
}

module.exports = { searchStops };
