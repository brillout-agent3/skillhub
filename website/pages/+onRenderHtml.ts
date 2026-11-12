import { dangerouslySkipEscape, escapeInject } from "vike/server";
import type { InjectFilterEntry, PageContextServer } from "vike/types";
import { siteHeadHtml } from "../brand.ts";
import { href } from "../format.ts";
import { themeScript } from "../theme.ts";
import { loggedInScript } from "../saves.ts";
// Geologica, with its sharpness axis: see the design notes atop style.css.
import "@fontsource-variable/geologica/shrp.css";
import "../style.css";

/** A page's `Page` returns the HTML of its `<main>`. */
export type Page = (pageContext: PageContextServer) => string;

export function onRenderHtml(pageContext: PageContextServer) {
  const { title, description } = pageContext.config;
  const value = (v: typeof title) => (typeof v === "function" ? v(pageContext) : (v ?? ""));
  // Every page gets the header.
  const path = pageContext.urlPathname.replace(/^\//, "");
  const head = `<header id="page-head">${siteHeadHtml(path && !path.endsWith("/") ? `${path}/` : path)}</header>`;
  const main = (pageContext.Page as Page)(pageContext);
  const documentHtml = escapeInject`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${value(title)}</title>
    <meta name="description" content="${value(description)}" />
    <link rel="icon" type="image/svg+xml" href="${href("gem.svg")}" />
    <script>${dangerouslySkipEscape(themeScript)}</script>
    <script>${dangerouslySkipEscape(loggedInScript)}</script>
  </head>
  <body>
    ${dangerouslySkipEscape(head)}
    <main id="app">${dangerouslySkipEscape(main)}</main>
  </body>
</html>`;
  return { documentHtml, injectFilter: preloadLatinOnly };
}

/**
 * Vike preloads every font file the stylesheets name: Geologica's six subsets, some 110 KB, of
 * which a page in English uses the Latin one, 29 KB. Only that one is preloaded: every visit
 * fetched the other five for nothing, ahead of the page's own script, and the browser said so in
 * its console. One of them still loads when a page has a letter of its own, such as a SKILL.md
 * that quotes Greek, as the stylesheet tells which letters each file has.
 */
function preloadLatinOnly(assets: InjectFilterEntry[]) {
  for (const asset of assets)
    if (asset.assetType === "font" && !/\/geologica-latin-shrp-[^/]*$/.test(asset.src))
      asset.inject = false;
}
