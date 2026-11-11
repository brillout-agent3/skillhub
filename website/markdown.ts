/** Render a skill's SKILL.md for its page. Raw HTML in it shows as text and never runs. */

import MarkdownIt from "markdown-it";

/** Where a relative link or image in the SKILL.md points, or null to drop it. */
export type Rebase = ((url: string, image: boolean) => string) | null;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Before the id of each of the SKILL.md's headings, so that none is an id of the page around it,
 * such as `tldr`: a link inside the SKILL.md to `#usage` points to `#md-usage`.
 */
const ANCHOR = "md-";

/**
 * A heading's anchor as GitHub makes it, which is what a SKILL.md's table of contents links to:
 * lowercase, without punctuation, and a hyphen for each space.
 */
const slug = (heading: string) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");

/** The `name` in a SKILL.md's frontmatter, unquoted, or null when it has none. */
export function nameInSkillMd(text: string): string | null {
  const frontmatter = FRONTMATTER.exec(text)?.[1] ?? "";
  return /^name:[ \t]*(["']?)(.+?)\1[ \t\r]*$/m.exec(frontmatter)?.[2] ?? null;
}

export function renderSkillMd(
  text: string,
  rebase: Rebase,
): { frontmatter: string | null; html: string } {
  const md = new MarkdownIt({ html: false, linkify: true });
  md.core.ruler.push("skill_md", (state) => {
    // The headings' anchors first: the links to them can come before, as in a table of contents.
    const anchors = new Set<string>();
    const repeats = new Map<string, number>();
    state.tokens.forEach((token, i) => {
      if (token.type !== "heading_open") return;
      // The page has its own h1 and h2: the SKILL.md's headings sit below them.
      token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + 2)}`;
      const words = (state.tokens[i + 1]?.children ?? [])
        .filter((child) => child.type === "text" || child.type === "code_inline")
        .map((child) => child.content);
      const base = slug(words.join(""));
      if (!base) return;
      // A repeated heading gets a number, as on GitHub: `usage`, `usage-1`, `usage-2`.
      let anchor = base;
      while (anchors.has(anchor)) {
        const n = (repeats.get(base) ?? 0) + 1;
        repeats.set(base, n);
        anchor = `${base}-${n}`;
      }
      anchors.add(anchor);
      token.attrSet("id", ANCHOR + anchor);
    });
    for (const token of state.tokens) {
      if (token.type === "heading_close")
        token.tag = `h${Math.min(6, Number(token.tag.slice(1)) + 2)}`;
      const children = token.children ?? [];
      children.forEach((child, i) => {
        const attr = child.type === "link_open" ? "href" : child.type === "image" ? "src" : null;
        const url = attr ? child.attrGet(attr) : null;
        if (!attr || typeof url !== "string" || !url || ABSOLUTE.test(url)) return;
        // A link to a heading of the SKILL.md itself, whatever its case, as on GitHub.
        const anchor = url.startsWith("#") ? anchorOf(url) : null;
        if (anchor !== null && anchors.has(anchor)) child.attrSet(attr, `#${ANCHOR}${anchor}`);
        else if (anchor === null && rebase) child.attrSet(attr, rebase(url, attr === "src"));
        else if (attr === "src")
          child.attrs = (child.attrs ?? []).filter(([name]) => name !== attr);
        // A link that would lead nowhere, such as to a heading the SKILL.md doesn't have, is
        // left as its words.
        else
          for (const end of [child, children.slice(i).find((c) => c.type === "link_close")]) {
            if (!end) continue;
            end.tag = "span";
            end.attrs = null;
          }
      });
    }
  });
  const m = FRONTMATTER.exec(text);
  return { frontmatter: m ? m[1] : null, html: md.render(m ? text.slice(m[0].length) : text) };
}

/** The anchor a link such as `#Getting-Started` points to: `getting-started`. */
function anchorOf(url: string): string {
  try {
    return decodeURIComponent(url.slice(1)).toLowerCase();
  } catch {
    // Not a valid escape, such as `#100%`: taken as written.
    return url.slice(1).toLowerCase();
  }
}
