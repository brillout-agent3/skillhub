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

/** A path on this site, under the base it's served from (`/` at https://skillhub.build). */
export const href = (path = "") => `${import.meta.env.BASE_URL}${path}`;
