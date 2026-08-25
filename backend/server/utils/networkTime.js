const serverConfig = require("../serverConfig");
const { getNetworkMeta } = require("../../memoryCache");

/*
 * Everything time-related, resolved in the active network's zone.
 *
 * Every timestamp this system produces is wall-clock time in the network's
 * timezone — not the host's and not the caller's. A Helsinki timetable reads
 * identically whether the process runs in Helsinki, Amman, or Virginia.
 *
 * The zone comes from the feed's own agency.txt, compiled into network-meta.
 * The configured map is a fallback for a feed without agency.txt, and UTC is
 * the last resort — never the host's zone, which would make timetables depend
 * on where the process happens to be deployed.
 */

const pad = (value) => String(value).padStart(2, "0");

function networkTimezone() {
  return (
    getNetworkMeta()?.timezone ??
    serverConfig.NETWORK_TIMEZONES[serverConfig.ACTIVE_NETWORK] ??
    "UTC"
  );
}

/**
 * The current date and time-of-day in the network's zone.
 *
 * @returns {{date: string, seconds: number}} `YYYY-MM-DD` and seconds from
 *   that date's midnight.
 */
function nowInNetwork() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: networkTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  // `hour12: false` yields "24" for midnight in some ICU versions.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    seconds: hour * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

/**
 * Shifts a `YYYY-MM-DD` string by whole days.
 *
 * Built from parts rather than `new Date(iso)`, which parses as UTC midnight
 * and lands on the previous day for any host west of Greenwich — silently
 * shifting a whole service day. Noon is used as the anchor so a daylight-saving
 * transition cannot push the result across a date boundary either.
 */
function shiftIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + days, 12);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** `YYYY-MM-DD` to the `YYYYMMDD` key used by active-services. */
function toDateId(isoDate) {
  return isoDate.replace(/-/g, "");
}

/**
 * Turns seconds-from-midnight into the calendar date and clock time it
 * actually falls on.
 *
 * GTFS counts past midnight rather than wrapping — a trip leaving at 25:10 is
 * the 01:10 service of the following day. Formatting that with a plain `% 24`
 * produces "01:10" attached to the wrong date, which sorts to the top of a
 * departure board and reads as this morning. Carrying the resolved date is
 * what makes an after-midnight departure unambiguous.
 *
 * @param {string} baseIsoDate The service date the seconds are measured from.
 * @param {number} seconds May exceed 86400, or be negative.
 */
function resolveDateAndTime(baseIsoDate, seconds) {
  const dayOffset = Math.floor(seconds / 86400);
  const withinDay = seconds - dayOffset * 86400;

  return {
    date: shiftIsoDate(baseIsoDate, dayOffset),
    time: `${pad(Math.floor(withinDay / 3600))}:${pad(Math.floor((withinDay % 3600) / 60))}`,
  };
}

/**
 * A calendar date on the network's clock, from an absolute instant.
 *
 * A `Date` is a moment, not a day, and which day it falls on depends on where
 * you ask. A tap at 23:30 in Helsinki is the previous day in Virginia, so
 * `toISOString().slice(0, 10)` — the obvious thing — reports the wrong date for
 * part of every day. `en-CA` is asked because it writes `YYYY-MM-DD` natively.
 *
 * @param {Date|null|undefined} instant
 * @returns {string|null} `YYYY-MM-DD`, or null when there is no instant.
 */
function isoDateInNetwork(instant) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) return null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: networkTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * The wall-clock date and time of an instant, on the network's clock.
 *
 * The pair rather than one or the other, because a card tap is a moment and
 * both halves of it are read together — and asking twice would format the same
 * instant twice through two `Intl` instances.
 *
 * @param {Date|null|undefined} instant
 * @returns {{date: string, time: string}|null}
 */
function wallClockInNetwork(instant) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: networkTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(instant)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    // 24-hour on the wire, like every other time this API returns. Only the
    // display is localised.
    time: `${parts.hour}:${parts.minute}`,
  };
}

module.exports = {
  networkTimezone,
  isoDateInNetwork,
  wallClockInNetwork,
  nowInNetwork,
  shiftIsoDate,
  toDateId,
  resolveDateAndTime,
};
