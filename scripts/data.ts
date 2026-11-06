/**
 * Read and write the data files, keeping their fields in one order, their comments, and the files
 * formatted.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse, stringify, type CommentToken } from "comment-json";
import { fileURLToPath } from "node:url";
import type { Crawl, Crawled, Data, Tldr } from "../data/types.ts";
import { github } from "../website/github.ts";

export const root = fileURLToPath(new URL("..", import.meta.url));
const path = `${root}data/skills.jsonc`;
const crawlPath = `${root}data/crawl.jsonc`;

export const readData = (): Data => readJsonc(path);

const TOP = ["$schema", "asOf", "facets", "repos", "bundles", "skills"];
const ORDER = [
  "id",
  "name",
  "skills.sh",
  "skillMd",
  "skew",
  "agentReview",
  "description",
  "tldr",
  "tags",
  "standalone",
  "note",
  "skills",
  "install",
];
const sorted = <T extends object>(o: T, order: string[]) => {
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => rank(a) - rank(b))) as T;
};

// ---------------------------------------------------------------- comments

/*
 * The data files are JSONC so that people can comment them, and the scripts keep the comments.
 * comment-json hangs each comment on the object or array around it, as a symbol named after where
 * it is: `before:tags`, `after-value:3`, `before-all`… The scripts lose those symbols when they
 * rebuild objects (spreads, `sorted`), and an array they re-sort would leave them at the wrong
 * index. So writeJsonc re-reads the comments of the file it overwrites and puts each one back at
 * the same place: the same path of keys, where an array entry is named by its id, not its index.
 */

/** Where comments go next to a key or an array entry, and inside an object or array. */
const AT_PROP = ["before", "after-prop", "after-colon", "after-value", "after"];
const INSIDE = ["before-all", "before", "after", "after-all"];

/** An array's entries, named so that they keep their name when the array is re-sorted. */
function entryNames(array: unknown[]): string[] {
  const taken = new Set<string>();
  return array.map((entry, i) => {
    const o = (entry ?? {}) as Record<string, any>;
    // Skills, bundles, repos and facet values have an id, disqualified skills a url, the other
    // skills of crawl.jsonc only their skills.sh page, facet groups a name, TLDR glance items and install commands a label.
    const id =
      typeof entry === "string"
        ? entry
        : (o.id ?? o.url ?? o["skills.sh"]?.url ?? o.name ?? o.label);
    const name = typeof id === "string" && !taken.has(id) ? id : `#${i}`;
    taken.add(name);
    return name;
  });
}

type Comments = Map<string, CommentToken[]>;
const placeKey = (path: string[], place: string) => JSON.stringify([...path, place]);

function collectComments(value: unknown, path: string[], into: Comments) {
  if (!value || typeof value !== "object") return;
  const names = Array.isArray(value) ? entryNames(value) : undefined;
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    const [prefix, ...prop] = (symbol.description ?? "").split(":");
    const place = prop.length ? `${prefix}:${names?.[Number(prop[0])] ?? prop.join(":")}` : prefix;
    into.set(placeKey(path, place), (value as any)[symbol]);
  }
  Object.entries(value).forEach(([prop, child], i) =>
    collectComments(child, [...path, names?.[i] ?? prop], into),
  );
}

function attachComments(value: unknown, path: string[], comments: Comments) {
  if (!value || typeof value !== "object") return;
  const put = (symbol: string, place: string) => {
    const tokens = comments.get(placeKey(path, place));
    if (tokens)
      Object.defineProperty(value, Symbol.for(symbol), { value: tokens, configurable: true });
  };
  for (const prefix of INSIDE) put(prefix, prefix);
  const names = Array.isArray(value) ? entryNames(value) : undefined;
  Object.entries(value).forEach(([prop, child], i) => {
    const name = names?.[i] ?? prop;
    for (const prefix of AT_PROP) put(`${prefix}:${prop}`, `${prefix}:${name}`);
    attachComments(child, [...path, name], comments);
  });
}

/** Comments are left out: writeJsonc takes them from the file. */
export const readJsonc = <T>(file: string): T =>
  parse(readFileSync(file, "utf8"), undefined, true) as T;

export function writeJsonc(file: string, value: unknown) {
  const comments: Comments = new Map();
  if (existsSync(file)) collectComments(parse(readFileSync(file, "utf8")), [], comments);
  attachComments(value, [], comments);
  writeFileSync(file, `${stringify(value, null, 2)}\n`);
  execFileSync(`${root}node_modules/.bin/oxfmt`, [file], { stdio: "ignore" });
}

// -------------------------------------------------------------------- data

export function writeData(data: Data) {
  data.skills = data.skills.map((s) =>
    sorted({ ...s, agentReview: sorted(s.agentReview, ORDER) }, ORDER),
  );
  data.bundles = data.bundles.map((b) => {
    const skills = b.agentReview.skills.map((m) => sorted(m, ORDER));
    return sorted({ ...b, agentReview: sorted({ ...b.agentReview, skills }, ORDER) }, ORDER);
  });
  writeJsonc(path, sorted(data, TOP));
}

// ------------------------------------------------------------------- crawl

const CRAWL_ORDER = ["$schema", "asOf", "qualified", "unqualified", "disqualified"];

export const readCrawl = (): Crawl => readJsonc(crawlPath);
export const writeCrawl = (crawl: Crawl) => writeJsonc(crawlPath, sorted(crawl, CRAWL_ORDER));

/** A skills.sh page as a key: skills.sh doesn't care about case. */
export const pageKey = (url: string) => url.toLowerCase().replace(/\/+$/, "");

/**
 * The skills.sh pages of the approved skills. A skill counts under its GitHub repo and name too,
 * since skills.sh can list one skill twice, such as from a website and from its repo.
 */
export function approvedPages(data: Data): Set<string> {
  const pages = new Set<string>();
  for (const s of data.skills) {
    pages.add(pageKey(s["skills.sh"].url));
    pages.add(pageKey(`https://skills.sh/${github(s).repo}/${s.name}`));
  }
  return pages;
}

/** What a skill of the top 600 needs to qualify: all-time installs, and its GitHub repo's stars. */
export const MINIMUMS = { installs: 5000, stars: 100 };

/** Whether a skill of the top 600 reaches the minimums. Unknown stars don't. */
export const passes = (c: Crawled) =>
  (c["skills.sh"].installs ?? 0) >= MINIMUMS.installs && (c.stars ?? -1) >= MINIMUMS.stars;

// -------------------------------------------------------------------- TLDRs

/** The most a TLDR may hold; there's no minimum. */
export const TLDR_LIMITS = { glanceItems: 8, labelWords: 4, glanceWords: 30, textWords: 200 };

/** What's wrong with a TLDR's glance and text, if anything. */
export function tldrProblems({ glance, text }: Pick<Tldr, "glance" | "text">): string[] {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const { glanceItems, labelWords, glanceWords, textWords } = TLDR_LIMITS;
  const problems: string[] = [];
  if (!text?.trim()) problems.push("the TLDR text is empty");
  else if (words(text) > textWords)
    problems.push(`the TLDR text has ${words(text)} words, at most ${textWords}`);
  if (!Array.isArray(glance)) return [...problems, "glance must be a list"];
  if (glance.length > glanceItems)
    problems.push(`glance has ${glance.length} items, at most ${glanceItems}`);
  for (const item of glance) {
    if (!item?.label?.trim() || !item?.text?.trim())
      problems.push("a glance item needs a label and a text");
    else if (words(item.label) > labelWords)
      problems.push(`glance label "${item.label}" has over ${labelWords} words`);
    else if (words(item.text) > glanceWords)
      problems.push(`glance item "${item.label}" has over ${glanceWords} words`);
  }
  return problems;
}
