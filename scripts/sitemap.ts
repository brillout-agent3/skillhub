/**
 * sitemap.ts — write the built site's sitemap.xml: the address of every page it has, for the
 * search engines, which website/public/robots.txt sends there. Without one they find a page only
 * by following links to it, and the skills list links to the thousand skills from one page.
 *
 * `pnpm build` runs it once Vike has pre-rendered the pages: it lists the pages that were built,
 * so it can't name one that isn't there, nor miss one. `pnpm check:site` holds it to that.
 * With SKILLHUB_DATA=edge-cases, it's the edge cases' site's: see data/edge-cases.ts.
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE, siteOf } from "../data/edge-cases.ts";
import { root } from "./data.ts";

const site = join(root, siteOf().dist, "client");
if (!existsSync(join(site, "index.html"))) {
  console.error("There's no built site to write the sitemap of: vike build comes first.");
  process.exit(1);
}

/**
 * A page's address, from its file: tags/index.html is /tags/, as Cloudflare serves it (see
 * `html_handling` in wrangler.jsonc). Each part of its path as a URL spells it.
 */
const address = (file: string) =>
  `${LIVE}/${file
    .split(/[\\/]/)
    .slice(0, -1)
    .map((part) => `${encodeURIComponent(part)}/`)
    .join("")}`;

const xml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Every page is an index.html: what else is there is the Not found page, 404.html.
const pages = readdirSync(site, { recursive: true, encoding: "utf8" })
  .filter((file) => /(^|[\\/])index\.html$/.test(file))
  .map(address)
  .sort();

writeFileSync(
  join(site, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((page) => `<url><loc>${xml(page)}</loc></url>`).join("\n")}
</urlset>
`,
);
console.log(`Wrote the sitemap: ${pages.length.toLocaleString("en")} pages.`);
