/**
 * leaderboard.ts — refresh the numbers from skills.sh and GitHub, and queue the skills to consider.
 *
 * It reads the skills.sh all-time top 600, which skills.sh embeds in its home page (its robots.txt
 * keeps scripts off its API), then:
 * - gives every listed skill its installs and weekly installs: from the top 600, or for a skill
 *   outside it, from its own skills.sh page, which also gives a missing first-seen date;
 * - gives the repos of listed skills and bundles their GitHub stars (when GITHUB_TOKEN is set),
 *   and every repo the count of its skills in the top 600;
 * - rewrites the queue in data/candidates.json: the skills of the top 600 that are on GitHub but
 *   neither listed nor ignored, most installed first, each with what its `skills.sh` field needs.
 *   An agent works through the queue with the add-skill skill.
 *
 * Run: pnpm run leaderboard
 */

import {
  ignoring,
  listedPages,
  pageKey,
  readCandidates,
  readData,
  writeCandidates,
  writeData,
  type Candidate,
} from "./data.ts";
import { get, pool } from "./fetch.ts";
import { bundleRepo, github } from "../website/types.ts";

const today = new Date().toISOString().slice(0, 10);
const errors: string[] = [];
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ------------------------------------------------------------------- reading skills.sh

/** What a skills.sh page streams to the browser: Next.js pushes it as JSON strings to self.__next_f. */
function payloadOf(html: string): string {
  let payload = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g))
    payload += JSON.parse(m[1]) as string;
  return payload;
}

/** The JSON object or array that starts at `start` in `text`. */
function jsonAt(text: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("unterminated JSON");
}

/** A skill of the skills.sh leaderboard. */
interface Entry {
  /** The skill's GitHub repo, `owner/name`, or for a website's skill its domain. */
  source: string;
  skillId: string;
  name: string;
  installs: number;
  weeklyInstalls: number[];
  isOfficial?: boolean;
}

const pageOf = (e: Entry) => `https://skills.sh/${e.source}/${e.skillId}`;

/** The skills.sh all-time top 600, most installed first. */
async function topSkills(): Promise<Entry[]> {
  const payload = payloadOf((await get("https://www.skills.sh/")) ?? "");
  const at = payload.indexOf('{"initialSkills":');
  if (at === -1)
    throw new Error("skills.sh: no leaderboard in its home page; did the page change?");
  const { initialSkills, view } = jsonAt(payload, at) as { initialSkills: Entry[]; view?: string };
  if (view !== "all-time" || initialSkills.length < 100)
    throw new Error(
      `skills.sh: expected the all-time leaderboard, got ${view} with ${initialSkills.length} skills`,
    );
  return initialSkills;
}

/** What a skill's own skills.sh page tells. */
interface Page {
  install: string;
  /** Rounded to three digits, such as 26.5K. */
  installs: number | null;
  weeklyInstalls: number[] | null;
  firstSeen: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Jan 22, 2026" as 2026-01-22. */
function day(text: string | undefined): string | null {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(text ?? "");
  if (!m || !MONTHS.includes(m[1])) return null;
  const month = String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0");
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}
/** "26.5K" as 26500. */
function count(text: string | undefined): number | null {
  const m = /^([\d.,]+)([KMB]?)$/.exec(text ?? "");
  if (!m) return null;
  const unit = { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2] as "" | "K" | "M" | "B"];
  return Math.round(Number(m[1].replace(/,/g, "")) * unit);
}

/** A skill's skills.sh page, or null when skills.sh doesn't have it. */
async function skillPage(url: string): Promise<Page | null> {
  const html = await get(url.replace("https://skills.sh/", "https://www.skills.sh/"));
  if (html === null) return null;
  // A stat is a label and its value: <span>Installs</span></div><div …>26.5K</div>.
  const stat = (label: string) =>
    new RegExp(`>${label}</span></div><div[^>]*>([^<]+)</div>`).exec(html)?.[1].trim();
  const install = /"command":"(npx skills add [^"]+)"/.exec(payloadOf(html))?.[1];
  if (!install) throw new Error(`${url}: no install command in the page; did the page change?`);
  const weekly = /aria-label="Weekly installs: ([^"]+)"/.exec(html)?.[1];
  return {
    install,
    installs: count(stat("Installs")),
    weeklyInstalls: weekly ? weekly.split(", ").map((n) => Number(n.replace(/,/g, ""))) : null,
    firstSeen: day(stat("First Seen")),
  };
}

// ------------------------------------------------------------------- refreshing

const data = readData();
const candidates = readCandidates();
const board = await topSkills();
const onBoard = new Map(board.map((e) => [pageKey(pageOf(e)), e]));

// Listed skills. A first-seen date never changes, so a skill's page is only read when it's
// outside the top 600 or has none.
let fromPages = 0;
await pool(data.skills, 4, async (skill) => {
  const sh = skill["skills.sh"];
  const entry = onBoard.get(pageKey(sh.url));
  if (entry) {
    sh.installs = entry.installs;
    sh.weeklyInstalls = entry.weeklyInstalls;
    if (sh.firstSeen) return;
  }
  const page = await skillPage(sh.url).catch((error: unknown) => {
    errors.push(`${skill.id}: ${message(error)}`);
    return undefined;
  });
  if (page === undefined) return;
  if (page === null) {
    errors.push(`${skill.id}: ${sh.url} is gone from skills.sh`);
    sh.installs = null;
    sh.weeklyInstalls = null;
    return;
  }
  fromPages++;
  if (!entry) {
    sh.installs = page.installs;
    sh.weeklyInstalls = page.weeklyInstalls;
  }
  sh.firstSeen ??= page.firstSeen;
});
data.asOf.installs = today;

// Repos.
const perRepo = new Map<string, number>();
for (const e of board)
  perRepo.set(e.source.toLowerCase(), (perRepo.get(e.source.toLowerCase()) ?? 0) + 1);
for (const repo of data.repos) repo.leaderboardSkills = perRepo.get(repo.id.toLowerCase()) ?? 0;
const token = process.env.GITHUB_TOKEN;
const used = new Set([...data.skills.map((s) => github(s).repo), ...data.bundles.map(bundleRepo)]);
let starred = 0;
if (token) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  await pool(
    data.repos.filter((r) => used.has(r.id)),
    4,
    async (repo) => {
      try {
        const json = await get(`https://api.github.com/repos/${repo.id}`, headers);
        if (json === null) errors.push(`repo ${repo.id}: not found on GitHub`);
        else {
          repo.stars = (JSON.parse(json) as { stargazers_count: number }).stargazers_count;
          starred++;
        }
      } catch (error) {
        errors.push(`repo ${repo.id}: ${message(error)}`);
      }
    },
  );
  // The repos that failed keep their stars for a day: the run fails, which says so.
  if (starred) data.asOf.stars = today;
} else console.log("GITHUB_TOKEN isn't set, so the stars weren't refreshed.");

// The queue. A website's skill isn't on GitHub: its source is a domain, and GitHub owners can't
// contain a dot. A skill already queued keeps its install command and first-seen date.
const listed = listedPages(data);
const before = new Map(candidates.queue.map((c) => [pageKey(c["skills.sh"].url), c]));
const wanted = board.filter(
  (e) =>
    !e.source.includes(".") && !listed.has(pageKey(pageOf(e))) && !ignoring(candidates, pageOf(e)),
);
const queue: (Candidate | undefined)[] = new Array(wanted.length);
const added: string[] = [];
await pool([...wanted.keys()], 4, async (i) => {
  const e = wanted[i];
  const url = pageOf(e);
  let known = before.get(pageKey(url))?.["skills.sh"];
  if (!known) {
    const page = await skillPage(url).catch((error: unknown) => {
      errors.push(`candidate ${url}: ${message(error)}`);
      return undefined;
    });
    if (page === null) errors.push(`candidate ${url}: no page on skills.sh`);
    if (!page) return; // Queued on the next run, once its page reads.
    known = {
      url,
      install: page.install,
      installs: null,
      weeklyInstalls: null,
      firstSeen: page.firstSeen,
    };
    added.push(url);
  }
  queue[i] = {
    name: e.name,
    repo: e.source,
    official: Boolean(e.isOfficial),
    "skills.sh": { ...known, installs: e.installs, weeklyInstalls: e.weeklyInstalls },
  };
});
candidates.queue = queue.filter((c) => c !== undefined);
candidates.asOf = today;

writeData(data);
writeCandidates(candidates);

console.log(
  `Read the skills.sh top ${board.length}: refreshed ${data.skills.length} skills (${fromPages} from their own page)${starred ? ` and the stars of ${starred} repos` : ""}. Queue: ${candidates.queue.length} skills, ${added.length} new.`,
);
for (const url of added) console.log(`  new ${url}`);
for (const e of errors) console.error(`  failed ${e}`);
if (errors.length) process.exit(1);
