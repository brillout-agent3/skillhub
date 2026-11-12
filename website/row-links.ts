/**
 * A row of a skills listing, the skills list's or a repo's or an owner's page, opens wherever it's
 * clicked, not only on its name: its page, or on the skills list on a wide screen, its preview
 * (see preview-client.ts), from where its page is a click away. The name stays the link to its
 * page, for the keyboard and screen readers; the row's own links and buttons, such as its tags, its
 * repo, its bundle's skills and Save, keep doing what they do. Rather than a link stretched over
 * the row, which would hide the numbers' tooltips and keep its words from being selected: a click
 * that ends a selection in the row selects, and does nothing else.
 */

/** The row a click opens, unless the click was on something of its own, and the link to its page. */
function rowOf(event: MouseEvent): { row: HTMLElement; link: HTMLAnchorElement } | null {
  const target = event.target as Element;
  const row = target.closest<HTMLElement>(".skill-list > li");
  if (!row || target.closest("a, button, input, label, summary, [tabindex]")) return null;
  const selection = getSelection();
  if (selection && !selection.isCollapsed && row.contains(selection.anchorNode)) return null;
  const link = row.querySelector<HTMLAnchorElement>(".skill-name");
  return link ? { row, link } : null;
}

/**
 * `preview` opens a row's preview, and says whether it did: when it didn't, as on a narrow
 * screen, the click opens the row's page.
 */
export function mountRowLinks(preview: (row: HTMLElement) => boolean = () => false) {
  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const found = rowOf(event);
    if (!found) return;
    // Its page in a new tab, as a link does with Ctrl, Cmd or Shift.
    if (event.ctrlKey || event.metaKey || event.shiftKey)
      open(found.link.href, "_blank", "noopener");
    else if (!preview(found.row)) found.link.click();
  });
  // And with the middle button.
  document.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const found = rowOf(event);
    if (!found) return;
    event.preventDefault();
    open(found.link.href, "_blank", "noopener");
  });
}
