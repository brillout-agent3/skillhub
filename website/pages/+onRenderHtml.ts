import { dangerouslySkipEscape, escapeInject } from "vike/server";
import type { PageContextServer } from "vike/types";
import { brandHtml } from "../brand.ts";
import { href } from "../format.ts";
import "../style.css";

/** A page's `Page` returns the HTML of its `<main>`. */
export type Page = (pageContext: PageContextServer) => string;

export function onRenderHtml(pageContext: PageContextServer) {
  const { title, description } = pageContext.config;
  const value = (v: typeof title) => (typeof v === "function" ? v(pageContext) : (v ?? ""));
  // The skills list has the site's name atop its sidebar; the other pages get it as a header.
  const path = pageContext.urlPathname.replace(/^\//, "");
  const head = path
    ? `<header id="page-head">${brandHtml(path.endsWith("/") ? path : `${path}/`)}</header>`
    : "";
  const main = (pageContext.Page as Page)(pageContext);
  // The skills list skips its sidebar to the list; the other pages skip their header.
  const skipTo = path ? "app" : "content";
  // The site's origin, such as https://brillout.github.io, for the share picture and the canonical
  // link, which need whole addresses; the deploy sets it, so a local build has neither.
  const site = process.env.SITE ?? "";
  const canonical = site ? `<link rel="canonical" href="${site}${href(path)}" />` : "";
  const share = site ? `${site}${href("share.png")}` : href("share.png");
  return escapeInject`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${value(title)}</title>
    <meta name="description" content="${value(description)}" />
    <link rel="icon" type="image/svg+xml" href="${href("gem.svg")}" />
    <meta name="theme-color" content="#eef0f3" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0b0c0e" media="(prefers-color-scheme: dark)" />
    <meta property="og:site_name" content="SkillHub" />
    <meta property="og:title" content="${value(title)}" />
    <meta property="og:description" content="${value(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${share}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${dangerouslySkipEscape(canonical)}
    <!-- The dealt faces (taste-skill start.mjs): Epilogue for text, JetBrains Mono for tags and code. -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Epilogue:wght@400..500&family=JetBrains+Mono:wght@400..500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <a class="skip-link" href="#${skipTo}">Skip to content</a>
    ${dangerouslySkipEscape(head)}
    <main id="app">${dangerouslySkipEscape(main)}</main>
  </body>
</html>`;
}
