/**
 * Saving skills and bundles: the Save buttons, and who's logged in and what they saved, which
 * account-client.ts gets from the Worker (worker/index.ts). Pages pre-render with nobody logged
 * in; in the browser, account-client.ts fills `account` in before the pages' scripts render.
 */

import { esc, href } from "./format.ts";

export type SaveKind = "skill" | "bundle";
/** What the Worker keeps of a save, such as `bundle:obra/superpowers`: a skill and a bundle can have the same id. */
export const saveKey = (kind: SaveKind, id: string) => `${kind}:${id}`;

export interface Account {
  user: { login: string; avatar: string } | null;
  /** Keys, as `saveKey` makes them. */
  saved: Set<string>;
  /**
   * Whether a key is still on the list, as the skills list's script tells, which has the data: a
   * saved skill can leave it, such as when its SKILL.md is gone. Elsewhere, every key counts.
   */
  listed?: (key: string) => boolean;
}
export const account: Account = { user: null, saved: new Set() };

/** Where account-client.ts keeps the API's last answer, so that a page shows it at once. */
export const ACCOUNT_CACHE = "skillhub:account";

/**
 * Inline in every page's <head>: marks <html data-logged-in> when the last answer said someone was
 * logged in, before the page is drawn, so that the pre-rendered Log in doesn't flash for them (see
 * [data-logged-in] in style.css). Whoever isn't logged in sees Log in at once.
 */
export const loggedInScript = `try { if (JSON.parse(localStorage.getItem(${JSON.stringify(ACCOUNT_CACHE)}) || "null")?.user) document.documentElement.dataset.loggedIn = ""; } catch {}`;

/**
 * Kept for the tab while it's away logging in: the page it left for it, and when. And where the
 * skills list was scrolled to as it was left, which it notes whenever it's left. The list comes
 * back from logging in as a new page, with no place noted in the browser's history: it opens where
 * it was left all the same (see list-client.ts). A first save, logged out, came back to the list's
 * top, the row just saved thousands of pixels down.
 */
export const LOGIN_FROM = "skillhub:login-from";
export const LEFT_AT = "skillhub:left-at";

/** Log in with GitHub, then back to this page, where it was, with `save` saved. */
export function loginHref(save?: string): string {
  const p = new URLSearchParams({
    return:
      typeof location === "undefined"
        ? href()
        : location.pathname + location.search + location.hash,
  });
  if (save) p.set("save", save);
  return `${href("api/auth/login")}?${p}`;
}

const BOOKMARK = `<path d="M5.5 3h9a.5.5 0 0 1 .5.5V17l-5-3.6L5 17V3.5a.5.5 0 0 1 .5-.5z" />`;
/** The bookmark, alone: for the skills list's Saved switch. */
export const bookmarkSvg = `<svg viewBox="0 0 20 20" aria-hidden="true">${BOOKMARK}</svg>`;

/**
 * How many skills and bundles you saved that are still listed, for the Saved switch, so that it
 * says as many as the list shows: none shown when logged out or for none.
 */
export function savedCount(): string {
  const { listed } = account;
  const n = listed ? [...account.saved].filter(listed).length : account.saved.size;
  return account.user && n ? String(n) : "";
}

/** The bookmark, outlined and filled: style.css shows the one for the button's state. */
const ICON = `<span class="save-icon" aria-hidden="true"><svg viewBox="0 0 20 20">${BOOKMARK}</svg><svg class="filled" viewBox="0 0 20 20">${BOOKMARK}</svg></span>`;

/** The words a Save button shows, by whether it's saved. */
export const saveLabel = (saved: boolean) => (saved ? "Saved" : "Save");

/**
 * What a Save button is called, for a screen reader: its word and the entry's name, "Save pdf" or
 * "Saved pdf". With its word as it shows it: named "Save pdf" while it read "Saved", what it's
 * called didn't hold what it says, which whoever speaks to their browser goes by.
 */
export const saveName = (saved: boolean, name: string) => `${saveLabel(saved)} ${name}`;

/** A Save button for the entry named `name`: its icon and its word. */
export function saveButton(key: string, name: string): string {
  const on = account.saved.has(key);
  return `<button type="button" class="save" data-save="${esc(key)}" data-name="${esc(name)}" aria-pressed="${on}" aria-label="${esc(saveName(on, name))}" title="${saveLabel(on)}">${ICON}<span class="save-word">${saveLabel(on)}</span></button>`;
}
