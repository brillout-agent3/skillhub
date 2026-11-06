/**
 * crawl.ts — crawl skills.sh and GitHub: refresh the numbers, and record every skill of the
 * skills.sh all-time top 600 in data/crawl.jsonc.
 *
 * It reads the top 600, which skills.sh embeds in its home page (its robots.txt keeps scripts off
 * its API), then:
 * - gives every approved skill (skills.jsonc) its installs and weekly installs: from the top 600,
 *   or for a skill outside it, from its own skills.sh page, which also gives a missing first-seen
 *   date;
 * - gives the repos of approved skills and bundles their GitHub stars (when GITHUB_TOKEN is set),
 *   and every repo the count of its skills in the top 600;
 * - records the other skills of the top 600 in crawl.jsonc, never removing one: a new skill on
 *   GitHub is crawled, a website's is skipped (not on GitHub), and a crawled skill that reaches
 *   the minimums is queued, or crawled again once it falls under them. A skill that leaves the top
 *   600 keeps its state and its last numbers. An agent works through the queue with the add-skill
 *   skill.
 *
 * Run: pnpm run crawl
 */

import {
  approvedPages,
  pageKey,
  passes,
  readCrawl,
  readData,
  writeCrawl,
  writeData,
  type Crawled,
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

/** A website's skill isn't on GitHub: its source is a domain (GitHub owners can't contain a dot), and its page is under site/. */
const onGitHub = (e: Entry) => !e.source.includes(".");
const pageOf = (e: Entry) =>
  `https://skills.sh/${onGitHub(e) ? "" : "site/"}${e.source}/${e.skillId}`;

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

// ------------------------------------------------------------------- approved skills

const data = readData();
const crawl = readCrawl();
const board = await topSkills();
const onBoard = new Map(board.map((e) => [pageKey(pageOf(e)), e]));

// A first-seen date never changes, so a skill's page is only read when it's outside the top 600
// or has none.
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

// ------------------------------------------------------------------- the crawl

// Every skill of the top 600 lands in crawl.jsonc, unless it's approved. A skill already there
// keeps its install command and first-seen date, and a skipped one stays as it is.
const approved = approvedPages(data);
const skipped = new Set(crawl.skipped.map((s) => pageKey(s.url)));
const recorded = new Map(
  [...crawl.crawled, ...crawl.queued].map((c) => [pageKey(c["skills.sh"].url), c]),
);
const added: string[] = [];
await pool(board, 4, async (e) => {
  const url = pageOf(e);
  if (approved.has(pageKey(url)) || skipped.has(pageKey(url))) return;
  if (!onGitHub(e)) {
    crawl.skipped.push({ url, note: `Not on GitHub: skills.sh lists it from ${e.source}.` });
    added.push(`skipped ${url}`);
    return;
  }
  let c = recorded.get(pageKey(url));
  if (!c) {
    const page = await skillPage(url).catch((error: unknown) => {
      errors.push(`${url}: ${message(error)}`);
      return undefined;
    });
    if (page === null) errors.push(`${url}: no page on skills.sh`);
    if (!page) return; // Recorded on the next run, once its page reads.
    const sh = {
      url,
      install: page.install,
      installs: null,
      weeklyInstalls: null,
      firstSeen: page.firstSeen,
    };
    c = {
      name: e.name,
      repo: e.source,
      official: false,
      stars: null,
      seen: today,
      "skills.sh": sh,
    };
    recorded.set(pageKey(url), c);
    added.push(`crawled ${url}`);
  }
  c.official = Boolean(e.isOfficial);
  c.seen = today;
  c["skills.sh"].installs = e.installs;
  c["skills.sh"].weeklyInstalls = e.weeklyInstalls;
});

// ------------------------------------------------------------------- stars

// For the repos of approved skills and bundles, and of the crawled and queued skills the crawl
// just saw.
const perRepo = new Map<string, number>();
for (const e of board)
  perRepo.set(e.source.toLowerCase(), (perRepo.get(e.source.toLowerCase()) ?? 0) + 1);
for (const repo of data.repos) repo.leaderboardSkills = perRepo.get(repo.id.toLowerCase()) ?? 0;
const token = process.env.GITHUB_TOKEN;
const seenToday = [...recorded.values()].filter((c) => c.seen === today);
const repos = new Set([
  ...data.skills.map((s) => github(s).repo),
  ...data.bundles.map(bundleRepo),
  ...seenToday.map((c) => c.repo),
]);
const stars = new Map<string, number>();
if (token) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  await pool([...repos], 4, async (repo) => {
    try {
      const json = await get(`https://api.github.com/repos/${repo}`, headers);
      if (json === null) errors.push(`repo ${repo}: not found on GitHub`);
      else stars.set(repo, (JSON.parse(json) as { stargazers_count: number }).stargazers_count);
    } catch (error) {
      errors.push(`repo ${repo}: ${message(error)}`);
    }
  });
  for (const repo of data.repos) repo.stars = stars.get(repo.id) ?? repo.stars;
  // The repos that failed keep their stars for a day: the run fails, which says so.
  if (stars.size) data.asOf.stars = today;
} else console.log("GITHUB_TOKEN isn't set, so the stars weren't refreshed.");
for (const c of seenToday) c.stars = stars.get(c.repo) ?? c.stars;

// ------------------------------------------------------------------- states

// The minimums decide between crawled and queued, from the numbers of today's crawl only: a skill
// that left the top 600 keeps its state.
const byInstalls = (a: Crawled, b: Crawled) =>
  (b["skills.sh"].installs ?? -1) - (a["skills.sh"].installs ?? -1);
const queuedBefore = new Set(crawl.queued.map((c) => pageKey(c["skills.sh"].url)));
const queued = (c: Crawled) =>
  c.seen === today ? passes(crawl, c) : queuedBefore.has(pageKey(c["skills.sh"].url));
crawl.crawled = [...recorded.values()].filter((c) => !queued(c)).sort(byInstalls);
crawl.queued = [...recorded.values()].filter(queued).sort(byInstalls);
const newlyQueued = crawl.queued.filter((c) => !queuedBefore.has(pageKey(c["skills.sh"].url)));
crawl.asOf = today;

writeData(data);
writeCrawl(crawl);

console.log(
  `Crawled the skills.sh top ${board.length}: refreshed ${data.skills.length} approved skills (${fromPages} from their own page)${stars.size ? ` and the stars of ${stars.size} repos` : ""}. crawl.jsonc: ${crawl.crawled.length} crawled, ${crawl.queued.length} queued (${newlyQueued.length} new), ${crawl.skipped.length} skipped.`,
);
for (const line of added) console.log(`  ${line}`);
for (const c of newlyQueued) console.log(`  queued ${c["skills.sh"].url}`);
for (const e of errors) console.error(`  failed ${e}`);
if (errors.length) process.exit(1);
