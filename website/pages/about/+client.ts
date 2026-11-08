/**
 * About: the breakdown's [i] tooltips. Hover and focus show a row's tooltip with CSS alone, but a
 * button doesn't take focus when clicked in Safari, so a click pins it open with `.open` on the
 * row. A click elsewhere, or Escape, closes it.
 */

import "../../account-client.ts";

const closeTips = (except?: Element | null) => {
  for (const row of document.querySelectorAll(".breakdown tr.open"))
    if (row !== except) row.classList.remove("open");
};

document.addEventListener("click", (event) => {
  const row = (event.target as Element).closest(".tip-i")?.closest("tr") ?? null;
  closeTips(row);
  row?.classList.toggle("open");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeTips();
  if (document.activeElement?.classList.contains("tip-i"))
    (document.activeElement as HTMLElement).blur();
});
