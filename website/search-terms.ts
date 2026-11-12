/**
 * How a search is read: by the skills list's search (list.ts) and by the Tags page's
 * (pages/tags/+client.ts), so that both find a tag by the same words. Apart, the Tags page looked
 * for a word anywhere in a tag's text, and "git" found flag:dual-use there, by "legitimate", after
 * the list had stopped finding it.
 */

/**
 * A text as the search compares it: in lowercase and without accents, so that "résumé" finds
 * "resume", and the other way around. Both what's searched for and what's looked in.
 */
export const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");

/**
 * What's searched for, plain, and without its double quotes, straight or curly: a search in quotes,
 * as one for an exact phrase elsewhere, looked for the quotes themselves, and found nothing.
 */
export const sought = (q: string) =>
  plain(q)
    .replace(/["“”]/g, " ")
    .trim();

/** A word of a search, and what tells whether it starts a word of a text. */
export interface Term {
  w: string;
  start: RegExp;
}

/**
 * The words of a search, as `sought` gives it: plurals cut back so they match the singular too
 * ("resumes" finds "resume", "strategies" finds "strategy").
 */
export function terms(phrase: string): Term[] {
  const singular = (w: string) =>
    w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
  return phrase
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .map((w) => ({
      w,
      start: new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"),
    }));
}
