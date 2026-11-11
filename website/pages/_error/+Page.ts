import { href } from "../../format.ts";

/**
 * Inline, atop the page, so that it runs before the page shows. This site's addresses are
 * lowercase, as on skills.sh (see ../../github.ts), while GitHub writes some owners and repos with
 * capitals, such as AgriciDaniel/claude-seo, and so do the pages here that name them. An address
 * with capitals is tried again in lowercase, once: there it has a page, or it's back here to stay.
 */
const LOWERCASE_SCRIPT = `(() => {
  const { pathname, search, hash } = location;
  const lower = pathname.toLowerCase();
  if (lower !== pathname) location.replace(lower + search + hash);
})();`;

export default () => `
  <script>${LOWERCASE_SCRIPT}</script>
  <div class="page">
    <h1>Page not found</h1>
    <p class="lede">There's no page at this address. <a href="${href()}">Browse the skills</a>.</p>
  </div>`;
