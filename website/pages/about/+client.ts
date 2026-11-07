/**
 * About: the breakdown's [i] tooltips. Hover and focus show them with CSS alone, but a button
 * doesn't take focus when clicked in Safari, so a click pins its tooltip open with `.open`. A click
 * elsewhere, or Escape, closes it.
 */

const closeTips = (except?: Element | null) => {
  for (const tip of document.querySelectorAll(".tip.open"))
    if (tip !== except) tip.classList.remove("open");
};

document.addEventListener("click", (event) => {
  const tip = (event.target as Element).closest(".tip-i")?.parentElement ?? null;
  closeTips(tip);
  tip?.classList.toggle("open");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeTips();
  if (document.activeElement?.classList.contains("tip-i"))
    (document.activeElement as HTMLElement).blur();
});
