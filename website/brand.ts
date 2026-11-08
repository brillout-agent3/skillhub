/** The site's name and its links: atop the skills list's sidebar, and as the header of the other pages. */

import { href } from "./format.ts";
import { GITHUB } from "./skills.ts";

const LINKS = [
  ["tags/", "Tags"],
  ["about/", "About"],
] as const;

/** `current` is the path of the page it's on, such as "tags/", to mark its link. */
export function brandHtml(current = ""): string {
  const links = LINKS.map(
    ([to, label]) =>
      `<a href="${href(to)}"${to === current ? ` aria-current="page"` : ""}>${label}</a>`,
  ).join("");
  // #account is Log in, or Saved and Log out: account-client.ts fills it in.
  return `
    <div class="brand-head">
      <a class="brand" href="${href()}">
        <img src="${href("gem.svg")}" alt="" width="28" height="28" />
        <span>SkillHub</span>
      </a>
      <nav class="site-links" aria-label="Site">${links}<a href="${GITHUB}">GitHub</a><span id="account" class="account"><a href="${href("api/auth/login")}" data-login>Log in</a></span></nav>
    </div>`;
}
