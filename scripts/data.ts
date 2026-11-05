/** Read and write the data files, keeping their fields in one order and the files formatted. */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { github, type Data, type SkillsSh } from "../website/types.ts";

export const root = fileURLToPath(new URL("..", import.meta.url));
const path = `${root}data/skills.json`;
const crawlPath = `${root}data/crawl.json`;

export const readData = (): Data => JSON.parse(readFileSync(path, "utf8"));

const TOP = ["updated", "asOf", "skip", "facets", "repos", "bundles", "skills"];
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

function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  execFileSync(`${root}node_modules/.bin/oxfmt`, [file], { stdio: "ignore" });
}

export function writeData(data: Data) {
  data.skills = data.skills.map((s) => sorted(s, ORDER));
  data.bundles = data.bundles.map((b) =>
    sorted({ ...b, skills: b.skills.map((m) => sorted(m, ORDER)) }, ORDER),
  );
  writeJson(path, sorted(data, TOP));
}

// ------------------------------------------------------------------- crawl

/**
 * The shape of data/crawl.json: every skill the crawl has seen in the skills.sh all-time top 600
 * that isn't approved (the approved ones are in skills.json), keyed by its skills.sh page. The two
 * files are cumulative: a skill that lands in either never leaves them, only its state changes.
 * Unlike skills.json, crawl.json takes any skill, such as one a website publishes.
 */
export interface Crawl {
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

export const readCrawl = (): Crawl => JSON.parse(readFileSync(crawlPath, "utf8"));
export const writeCrawl = (crawl: Crawl) => writeJson(crawlPath, crawl);

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
