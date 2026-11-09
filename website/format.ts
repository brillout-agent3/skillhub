/** Formatting and links shared by every page. */

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A shell command, escaped, that wraps only between its words, or after a slash in a URL: a browser
 * would otherwise break a line after a hyphen, such as inside --skill.
 */
export const commandHtml = (command: string) =>
  command
    .split(" ")
    .map((word) =>
      word
        .split(/(?<=\/)/)
        .map((part) => `<span class="word">${esc(part)}</span>`)
        .join("<wbr>"),
    )
    .join(" ");

/** 3.5M, 907K, 54.5K, 812 */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e5) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
const longDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
export const date = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));
/**
 * A TLDR's glance item, shown after its label and a colon ("Use it when: You want…."): with a full
 * stop, unless it ends in its own "?" or "!". See the write-tldr skill.
 */
export const glanceEnd = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
/** The day `n` days before a day, both YYYY-MM-DD. */
export const daysBefore = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
export const plural = (n: number, word: string) =>
  `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;
/**
 * How long before `asOf` a day was, both YYYY-MM-DD, as a number and one word, rounded down: 3 days,
 * 5 weeks (from 2 to 8), 9 months, 1.5 years (a decimal under 5 years), 7 years.
 */
export function age(day: string, asOf: string): string {
  const days = Math.max(0, Math.round((Date.parse(asOf) - Date.parse(day)) / 86_400_000));
  const years = days / 365.25;
  if (days < 14) return plural(days, "day");
  if (days < 61) return plural(Math.floor(days / 7), "week");
  if (years < 1) return plural(Math.floor(years * 12), "month");
  return plural(years < 5 ? Math.floor(years * 10) / 10 : Math.floor(years), "year");
}

/** A path on this site, under the base it's served from (`/` at https://skillhub.build). */
export const href = (path = "") => `${import.meta.env.BASE_URL}${path}`;
