/**
 * Lets the keyboard reach what scrolls sideways in a skill's SKILL.md: a code block or a table
 * wider than the page. Only the ones that scroll get a tab stop, so that a page with thirty short
 * code blocks doesn't get thirty; they're checked again whenever the page's width changes, or the
 * frontmatter opens.
 */
export function mountScrollables() {
  const section = document.querySelector(".skill-md");
  if (!section) return;
  const blocks = section.querySelectorAll<HTMLElement>(
    ".markdown pre, .markdown table, .frontmatter pre",
  );
  const sync = () => {
    for (const block of blocks)
      if (block.scrollWidth > block.clientWidth) block.tabIndex = 0;
      else block.removeAttribute("tabindex");
  };
  // It also runs right away, when the observer starts.
  new ResizeObserver(sync).observe(section);
}
