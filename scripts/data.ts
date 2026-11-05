/** Read and write the data files, keeping their fields in one order and the files formatted. */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { github, type Data, type SkillsSh } from "../website/types.ts";

export const root = fileURLToPath(new URL("..", import.meta.url));
const path = `${root}data/skills.json`;
const candidatesPath = `${root}data/candidates.json`;

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

// ------------------------------------------------------------------- candidates

/**
 * The shape of data/candidates.json: the skills an agent may add to skills.json, with the
 * add-skill skill, and the ones not to add. Skills are keyed by their skills.sh page.
 */
export interface Candidates {
  /** When leaderboard.ts last rewrote the queue (YYYY-MM-DD). */
  asOf: string;
  /**
   * The skills of the skills.sh all-time top 600 that are on GitHub but neither listed nor
   * ignored, most installed first. leaderboard.ts rewrites it daily; adding or ignoring a skill
   * takes it out.
   */
  queue: Candidate[];
  /** What never to queue, each with why: a skill's skills.sh page, or a repo's (`https://skills.sh/owner/repo`) for all its skills. */
  ignored: { url: string; note: string }[];
}

export interface Candidate {
  name: string;
  /** Its GitHub repo as skills.sh names it, which can be an old name the repo redirects from. */
  repo: string;
  /** Whether skills.sh shows its publisher as verified. */
  official: boolean;
  /** Its `skills.sh` field once it's in skills.json. */
  "skills.sh": SkillsSh;
}

export const readCandidates = (): Candidates => JSON.parse(readFileSync(candidatesPath, "utf8"));
export const writeCandidates = (candidates: Candidates) => writeJson(candidatesPath, candidates);

/** A skills.sh page as a key: skills.sh doesn't care about case. */
export const pageKey = (url: string) => url.toLowerCase().replace(/\/+$/, "");

/**
 * The skills.sh pages of the listed skills. A skill counts under its GitHub repo and name too,
 * since skills.sh can list one skill twice, such as from a website and from its repo.
 */
export function listedPages(data: Data): Set<string> {
  const pages = new Set<string>();
  for (const s of data.skills) {
    pages.add(pageKey(s["skills.sh"].url));
    pages.add(pageKey(`https://skills.sh/${github(s).repo}/${s.name}`));
  }
  return pages;
}

/** The `ignored` entry that covers a skills.sh page, if any: the page's own, or its repo's. */
export const ignoring = (candidates: Pick<Candidates, "ignored">, url: string) =>
  candidates.ignored.find(
    (i) => pageKey(url) === pageKey(i.url) || pageKey(url).startsWith(`${pageKey(i.url)}/`),
  );
