/**
 * A row of a skills listing, the skills list's or a repo's or an owner's page, opens its skill's or
 * bundle's page wherever it's clicked, not only on its name. The name stays the link, for the
 * keyboard and screen readers; the row's own links and buttons, such as its tags, its repo, its
 * bundle's skills and Save, keep doing what they do. Rather than a link stretched over the row,
 * which would hide the numbers' tooltips and keep its words from being selected: a click that
 * ends a selection in the row selects, and doesn't leave the page.
 */

/** The link a click opens: the row's name, unless the click was on something of its own. */
function linkOf(event: MouseEvent): HTMLAnchorElement | null {
  const target = event.target as Element;
  const row = target.closest(".skill-list > li");
  if (!row || target.closest("a, button, input, label, summary, [tabindex]")) return null;
  const selection = getSelection();
  if (selection && !selection.isCollapsed && row.contains(selection.anchorNode)) return null;
  return row.querySelector<HTMLAnchorElement>(".skill-name");
}

export function mountRowLinks() {
  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const link = linkOf(event);
    if (!link) return;
    // In a new tab, as a link does with Ctrl, Cmd or Shift.
    if (event.ctrlKey || event.metaKey || event.shiftKey) open(link.href, "_blank", "noopener");
    else link.click();
  });
  // And with the middle button.
  document.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const link = linkOf(event);
    if (!link) return;
    event.preventDefault();
    open(link.href, "_blank", "noopener");
  });
}
