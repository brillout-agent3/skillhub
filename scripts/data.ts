/**
 * Read and write the data files, keeping their fields in one order, their comments, and the files
 * formatted.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse, stringify, type CommentToken } from "comment-json";
import { fileURLToPath } from "node:url";
import { github, type Data, type SkillsSh } from "../website/types.ts";

export const root = fileURLToPath(new URL("..", import.meta.url));
const path = `${root}data/skills.jsonc`;
const crawlPath = `${root}data/crawl.jsonc`;

export const readData = (): Data => readJsonc(path);

const TOP = ["$schema", "updated", "asOf", "skip", "facets", "repos", "bundles", "skills"];
const ORDER = [
  "id",
  "name",
  "description",
  "tldr",
  "tags",
  "skills.sh",
  "skillMd",
  "standalone",
  "note",
  "skills",
  "install",
  "skew",
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
    // Skills, bundles, repos and facet values have an id, skipped skills a url, crawled skills only
    // their skills.sh page, facet groups a name, TLDR glance items and install commands a label.
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
  data.skills = data.skills.map((s) => sorted(s, ORDER));
  data.bundles = data.bundles.map((b) =>
    sorted({ ...b, skills: b.skills.map((m) => sorted(m, ORDER)) }, ORDER),
  );
  writeJsonc(path, sorted(data, TOP));
}

// ------------------------------------------------------------------- crawl

/**
 * The shape of data/crawl.jsonc: every skill the crawl has seen in the skills.sh all-time top 600
 * that isn't approved (the approved ones are in skills.jsonc), keyed by its skills.sh page. The two
 * files are cumulative: a skill that lands in either never leaves them, only its state changes.
 * Unlike skills.jsonc, crawl.jsonc takes any skill, such as one a website publishes.
 */
export interface Crawl {
  /** The JSON Schema of this file, generated from this interface by schema.ts: for editors. */
  $schema: string;
  /** When crawl.ts last ran (YYYY-MM-DD). */
  asOf: string;
  /** What a crawled skill needs to be queued: all-time installs, and its GitHub repo's stars. */
  minimums: { installs: number; stars: number };
  /** Below the minimums, most installed first. */
  crawled: Crawled[];
  /** At the minimums or above, most installed first: waiting for an agent to approve or skip them, with the add-skill skill. */
  queued: Crawled[];
  /** Not to be shown, each with why, and with no agent data: no tags, no TLDR, no copy of its SKILL.md. */
  skipped: Skipped[];
}

export interface Crawled {
  name: string;
  /** Its GitHub repo, `owner/name`, as skills.sh names it: possibly an old name the repo redirects from. */
  repo: string;
  /** Whether skills.sh shows its publisher as verified. */
  official: boolean;
  /** Its repo's GitHub stars, or null when unknown. */
  stars: number | null;
  /** The last day the crawl saw it in the top 600, which its numbers are from (YYYY-MM-DD). */
  seen: string;
  /** Its `skills.sh` field once it's approved. */
  "skills.sh": SkillsSh;
}

export interface Skipped {
  /** Its skills.sh page. */
  url: string;
  note: string;
}

export const readCrawl = (): Crawl => readJsonc(crawlPath);
export const writeCrawl = (crawl: Crawl) => writeJsonc(crawlPath, crawl);

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

/** Whether a crawled skill passes the minimums. Unknown stars don't. */
export const passes = ({ minimums }: Pick<Crawl, "minimums">, c: Crawled) =>
  (c["skills.sh"].installs ?? 0) >= minimums.installs && (c.stars ?? -1) >= minimums.stars;
