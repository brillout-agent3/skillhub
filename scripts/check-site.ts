/**
 * check-site.ts — check the built site, website/dist/client, as Cloudflare serves it: every
 * internal link, image and script leads somewhere, `#fragment` included; every id a page refers to
 * is in it, once; no page shows a value that never got filled in; each preloads the one font
 * file its words are drawn in; each has what a shared link's card shows; and the sitemap lists
 * every page, which robots.txt sends search engines to.
 *
 * It reads the HTML as text, which is enough for pages this repo renders itself: every attribute
 * is double-quoted, and the text of a SKILL.md is escaped.
 *
 * Run: pnpm run build && pnpm run check:site
 * With SKILLHUB_DATA=edge-cases on both, it checks the edge cases' site: see data/edge-cases.ts.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { EDGE_CASES, LIVE, siteOf } from "../data/edge-cases.ts";
import { root } from "./data.ts";

const site = join(root, siteOf().dist, "client");
if (!existsSync(join(site, "index.html"))) {
  console.error("There's no built site to check: run pnpm run build first.");
  process.exit(1);
}

const errors = new Map<string, string[]>();
/** One line per problem, with a page that has it and how many others do. */
const fail = (problem: string, page: string) =>
  errors.set(problem, [...(errors.get(problem) ?? []), page]);

const pages = readdirSync(site, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".html"))
  .map((file) => file.split("\\").join("/"));

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();
/**
 * The file Cloudflare serves for a path, by `html_handling: "auto-trailing-slash"` in
 * wrangler.jsonc: /tags/ is tags/index.html. Null when there's none, or when it would first
 * redirect, as /tags does to /tags/.
 */
function served(path: string): string | null {
  const file = join(site, decodeURIComponent(path));
  if (path.endsWith("/")) return isFile(join(file, "index.html")) ? join(file, "index.html") : null;
  return isFile(file) ? file : null;
}

/** An attribute's value as it was before the pages escaped it: see `esc` in website/format.ts, and markdown-it's. */
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', lt: "<", gt: ">" };
const unescape = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&(amp|quot|lt|gt);/g, (_, name) => ENTITIES[name]);

const idsOf = new Map<string, Set<string>>();
const htmlOf = (file: string) =>
  // What a script holds isn't the page's own markup.
  readFileSync(file, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
/** A page's ids, read once: `html` when the caller has the page at hand. */
function ids(file: string, html?: string): Set<string> {
  let found = idsOf.get(file);
  if (!found) {
    const matches = (html ?? htmlOf(file)).matchAll(/\sid="([^"]*)"/g);
    found = new Set([...matches].map((m) => unescape(m[1])));
    idsOf.set(file, found);
  }
  return found;
}

/** The attributes that name other elements of their page, by id. */
const ID_REFS = /\s(?:aria-controls|aria-labelledby|aria-describedby|aria-owns|for)="([^"]*)"/g;
/**
 * A value that never got filled in, as an attribute, in a link or as an element's whole text. Not
 * looked for in a SKILL.md, whose own text can hold any of these.
 */
const UNFILLED =
  /="(?:undefined|null|NaN)"|[/=](?:undefined|NaN)[/"&]|>(?:undefined|NaN|\[object Object\])</;
const SKILL_MD = /<section class="skill-md"[\s\S]*?<\/section>/;

let links = 0;
for (const page of pages) {
  const file = join(site, page);
  const html = htmlOf(file);
  const at = `/${page}`;
  const own = ids(file, html);

  const seen = new Set<string>();
  for (const [, id] of html.matchAll(/\sid="([^"]*)"/g)) {
    if (seen.has(id)) fail(`the id "${unescape(id)}" is on more than one element`, at);
    seen.add(id);
  }
  for (const [, refs] of html.matchAll(ID_REFS))
    for (const id of unescape(refs).split(/\s+/).filter(Boolean))
      if (!own.has(id))
        fail(`an element refers to the id "${id}", which its page doesn't have`, at);

  for (const [, raw] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const url = unescape(raw);
    // Other sites, and the Worker's API, which isn't a file.
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || url.startsWith("/api/")) continue;
    links++;
    const [path, fragment] = url.split("#");
    const pathname = path.split("?")[0];
    let target = file;
    if (pathname) {
      const absolute = pathname.startsWith("/")
        ? pathname
        : posix.join(posix.dirname(at), pathname);
      const found = served(absolute);
      if (!found) {
        fail(
          served(`${absolute}/`)
            ? `a link to ${url} lacks its trailing slash, so it redirects`
            : `a link to ${url} leads nowhere`,
          at,
        );
        continue;
      }
      target = found;
    }
    if (fragment && target.endsWith(".html") && !ids(target).has(decodeURIComponent(fragment)))
      fail(
        `a link to ${pathname ? url : `#${fragment}`} leads to no element of ${pathname ? "that" : "its"} page`,
        at,
      );
  }

  const unfilled = UNFILLED.exec(html.replace(SKILL_MD, ""));
  if (unfilled) fail(`a value that was never filled in: ${unfilled[0]}`, at);
  // The Latin subset, and none of the five others, which a page in English fetched for nothing:
  // see preloadLatinOnly in website/pages/+onRenderHtml.ts.
  const fonts = [...html.matchAll(/<link\b[^>]*\sas="font"[^>]*>/g)].map(
    ([link]) => /\shref="([^"]*)"/.exec(link)?.[1] ?? "",
  );
  if (fonts.length !== 1 || !/\/geologica-latin-shrp-[^/]*\.woff2$/.test(fonts[0]))
    fail(
      `it preloads ${fonts.length} font files, rather than the Latin one alone: ${fonts.join(", ") || "none"}`,
      at,
    );
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) fail("not exactly one <h1>", at);
  if (!/<title>[^<]+<\/title>/.test(html)) fail("no <title>", at);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail("no description", at);
  // What a shared link shows: see the card's tags in website/pages/+onRenderHtml.ts.
  for (const tag of ["og:site_name", "og:title", "og:description"]) {
    const said = new RegExp(`<meta property="${tag}" content="([^"]*)"`).exec(html)?.[1];
    if (!said) fail(`no ${tag} for the card of a shared link`, at);
    else if (unescape(said).length > 301) fail(`an ${tag} too long for a card`, at);
  }
}

/*
 * What search engines ask for first: robots.txt (website/public/), which sends them to the
 * sitemap, and the sitemap (scripts/sitemap.ts), which lists every page once, at the address it's
 * live at, and nothing that isn't one, such as the Not found page.
 */
const text = (path: string) =>
  isFile(join(site, path)) ? readFileSync(join(site, path), "utf8") : null;
/** The pages' paths, as their addresses spell them: tags/index.html is /tags/. */
const paths = pages
  .filter((page) => /(^|\/)index\.html$/.test(page))
  .map((page) => `/${page.slice(0, -"index.html".length)}`);
const sitemap = text("sitemap.xml");
let listed = 0;
if (sitemap === null)
  fail("there's no sitemap: pnpm build writes it, after vike build", "/sitemap.xml");
else {
  const found = new Set<string>();
  for (const [, loc] of sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const address = unescape(loc);
    listed++;
    if (!address.startsWith(`${LIVE}/`)) {
      fail(`the sitemap lists an address that isn't on ${LIVE}`, address);
      continue;
    }
    const path = decodeURIComponent(address.slice(LIVE.length));
    if (found.has(path)) fail("the sitemap lists a page twice", path);
    found.add(path);
    if (!paths.includes(path)) fail("the sitemap lists what isn't a page", path);
  }
  for (const path of paths) if (!found.has(path)) fail("the sitemap lacks a page", path);
}
const robots = text("robots.txt");
if (robots === null)
  fail("there's no robots.txt, which sends search engines to the sitemap", "/robots.txt");
else {
  if (!robots.split("\n").includes(`Sitemap: ${LIVE}/sitemap.xml`))
    fail(`robots.txt doesn't name the sitemap, with "Sitemap: ${LIVE}/sitemap.xml"`, "/robots.txt");
  // What it keeps them from is the API alone: an empty Disallow keeps them from nothing.
  for (const [, rule] of robots.matchAll(/^Disallow:[ \t]*(\S+)/gm)) {
    const kept = paths.find((path) => path.startsWith(rule));
    if (kept) fail(`robots.txt keeps search engines from a page, with "Disallow: ${rule}"`, kept);
  }
}

if (errors.size) {
  const lines = [...errors].map(([problem, where]) => {
    const others = where.length > 1 ? ` and ${where.length - 1} other page(s)` : "";
    return `  ${problem}: ${where[0]}${others}`;
  });
  console.error(
    `The built site${EDGE_CASES ? " of the edge cases" : ""} has ${errors.size} problem(s):\n${lines.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `The built site${EDGE_CASES ? " of the edge cases" : ""} is sound: ${pages.length.toLocaleString("en")} pages, ${links.toLocaleString("en")} internal links, ${listed.toLocaleString("en")} pages in its sitemap.`,
);
