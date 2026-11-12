import { href } from "../../format.ts";

/**
 * Inline, atop the page, so that it runs before the page shows. An address that isn't written as
 * this site writes its own (see ../../github.ts) is tried again as it does, once: there it has a
 * page, or it's back here to stay.
 * - In lowercase, as on skills.sh, while GitHub writes some owners and repos with capitals, such as
 *   AgriciDaniel/claude-seo, and so do the pages here that name them.
 * - A bundle's, with a slash for its @: /bundle/mattpocock/skills@writing/ is where that bundle's
 *   page was, and skills%40writing how Cloudflare made the address bar spell it.
 */
const RETRY_SCRIPT = `(() => {
  const { pathname, search, hash } = location;
  let to = pathname.toLowerCase();
  if (to.includes("/bundle/")) to = to.replace(/@|%40/g, "/");
  if (to !== pathname) location.replace(to + search + hash);
})();`;

export default () => `
  <script>${RETRY_SCRIPT}</script>
  <div class="page">
    <h1>Page not found</h1>
    <p class="lede">There's no page at this address. <a href="${href()}">Browse the skills</a>.</p>
  </div>`;
