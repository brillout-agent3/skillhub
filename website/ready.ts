/**
 * Marks the page once its script has run to its end: `<html data-ready>`. The pages are
 * pre-rendered, so they show before their controls work; whoever drives the site, a test or an
 * agent, waits for this before using them. Every page's +client.ts calls it last, so that a script
 * that throws on its way leaves the page unmarked.
 *
 * Other marks to wait for, once it's ready: `<html data-account>` when the API has told who's
 * logged in (account-client.ts), and on the skills list `<html data-search-words>` and
 * `#results[aria-busy]` (list-client.ts).
 */
export const ready = () => document.documentElement.setAttribute("data-ready", "");
