/**
 * About: the breakdown's [i] tooltips. Hover and focus show a row's tooltip with CSS alone, but a
 * button doesn't take focus when clicked in Safari, so a click pins it open with `.open` on the
 * row. A click elsewhere, or Escape, closes it.
 */

import "../../account-client.ts";
import { ready } from "../../ready.ts";

const closeTips = (except?: Element | null) => {
  for (const row of document.querySelectorAll(".breakdown tr.open"))
    if (row !== except) row.classList.remove("open");
};

document.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLElement>(".tip-i");
  const row = button?.closest("tr") ?? null;
  closeTips(row);
  // A second click or tap closes it, which takes the focus off the button too: where a click gives
  // it the focus, as in Chrome, the focus alone kept the tooltip open. Not the keyboard's, whose
  // focus is its place in the page: `detail` is 0 for a click made with Enter or Space.
  if (row && !row.classList.toggle("open") && event.detail > 0) button?.blur();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeTips();
  if (document.activeElement?.classList.contains("tip-i"))
    (document.activeElement as HTMLElement).blur();
});

ready();
