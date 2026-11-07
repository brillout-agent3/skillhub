/**
 * crawl.ts — crawl skills.sh and GitHub: refresh the numbers, and record in data/crawl.jsonc every
 * skill of the skills.sh all-time top 600, and every skill further down that reaches
 * MINIMUMS.installs.
 *
 * It reads the top 600, which skills.sh embeds in its home page (its robots.txt keeps scripts off
 * its API), and skills.sh's sitemap, then:
 * - gives every approved skill (skills.jsonc) its installs and weekly installs: from the top 600,
 *   or for a skill outside it, from its own skills.sh page, which also gives a missing first-seen
 *   date;
 * - gives the repos of approved skills and bundles their GitHub stars (when GITHUB_TOKEN is set);
 * - records the other skills of the top 600 in crawl.jsonc, never removing one: a skill on GitHub
 *   is qualified while it reaches the minimums and unqualified while it doesn't, and a website's is
 *   disqualified (not on GitHub);
 * - reads the page of every other skill of the sitemap, in its order, until UNDER_IN_A_ROW skills
 *   in a row are under MINIMUMS.installs, and records those that reach it the same way, or
 *   refreshes them once recorded.
 *
 * A skill outside both keeps its state and its last numbers. An agent approves or disqualifies the
 * qualified skills with the add-skill skill.
 *
 * Run: pnpm run crawl
 */

import {
  approvedPages,
  MINIMUMS,
  pageKey,
  passes,
  readCrawl,
  readData,
  writeCrawl,
  writeData,
} from "./data.ts";
import { get, pool } from "./fetch.ts";
import type { Crawled } from "../data/types.ts";
import { bundleRepo, github } from "../website/github.ts";

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
  /** Rounded to three digits, such as 26.5K. */
  installs: number | null;
  weeklyInstalls: number[] | null;
  firstSeen: string | null;
  /** Whether skills.sh shows its publisher as verified, as the top 600's `isOfficial` does. */
  official: boolean;
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
async function readSkillPage(url: string): Promise<Page | null> {
  const html = await get(url.replace("https://skills.sh/", "https://www.skills.sh/"));
  if (html === null) return null;
  // A stat is a label and its value: <span>Installs</span></div><div …>26.5K</div>.
  const stat = (label: string) =>
    new RegExp(`>${label}</span></div><div[^>]*>([^<]+)</div>`).exec(html)?.[1].trim();
  // Every skill's page has its install command: one without it is a page that changed.
  if (!/"command":"npx skills add /.test(payloadOf(html)))
    throw new Error(`${url}: no install command in the page; did the page change?`);
  const weekly = /aria-label="Weekly installs: ([^"]+)"/.exec(html)?.[1];
  return {
    installs: count(stat("Installs")),
    weeklyInstalls: weekly ? weekly.split(", ").map((n) => Number(n.replace(/,/g, ""))) : null,
    firstSeen: day(stat("First Seen")),
    official: html.includes('title="Verified organization on GitHub"'),
  };
}

/** Each page read once per run: the approved skills and the sitemap share some. */
const pages = new Map<string, Promise<Page | null>>();
function skillPage(url: string): Promise<Page | null> {
  if (!pages.has(pageKey(url))) pages.set(pageKey(url), readSkillPage(url));
  return pages.get(pageKey(url)) as Promise<Page | null>;
}

/** The skill pages of skills.sh's sitemap, as https://skills.sh/owner/repo/skill, in its order. */
async function sitemapSkills(): Promise<string[]> {
  const index = (await get("https://www.skills.sh/sitemap.xml")) ?? "";
  const maps = [...index.matchAll(/<loc>([^<]*\/sitemap-skills-\d+\.xml)<\/loc>/g)].map(
    (m) => m[1],
  );
  if (!maps.length)
    throw new Error("skills.sh: no skills sitemap in its sitemap.xml; did it change?");
  const urls: string[] = [];
  for (const map of maps)
    for (const m of ((await get(map)) ?? "").matchAll(
      /<loc>https:\/\/www\.skills\.sh\/([^/<.]+\/[^/<]+\/[^/<]+)<\/loc>/g,
    ))
      urls.push(`https://skills.sh/${m[1]}`);
  return urls;
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
// keeps its first-seen date, and a disqualified one stays as it is.
const approved = approvedPages(data);
const disqualified = new Set(crawl.disqualified.map((s) => pageKey(s.url)));
const recorded = new Map(
  [...crawl.qualified, ...crawl.unqualified].map((c) => [pageKey(c["skills.sh"].url), c]),
);
const added: string[] = [];
await pool(board, 4, async (e) => {
  const url = pageOf(e);
  if (approved.has(pageKey(url)) || disqualified.has(pageKey(url))) return;
  if (!onGitHub(e)) {
    crawl.disqualified.push({ url, reason: { notOnGitHub: e.source } });
    added.push(`disqualified ${url}`);
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
    added.push(`recorded ${url}`);
  }
  c.official = Boolean(e.isOfficial);
  c.seen = today;
  c["skills.sh"].installs = e.installs;
  c["skills.sh"].weeklyInstalls = e.weeklyInstalls;
});

// ------------------------------------------------------------------- beyond the top 600

/**
 * How far down the sitemap the crawl reads: until this many skills in a row are under
 * MINIMUMS.installs. The sitemap lists skills roughly most installed first, but loosely, so a
 * skill that reaches the minimum can come after many that don't.
 */
const UNDER_IN_A_ROW = 1000;

// The sitemap's skills that reach MINIMUMS.installs land in crawl.jsonc too, with the rounded
// numbers of their own page. A page that doesn't read is retried on the next run: only many of
// them fail the run, such as when skills.sh changed its pages.
const sitemap = await sitemapSkills();
const unread: string[] = [];
let fromSitemap = 0;

/** Read a skill of the sitemap: whether it reaches MINIMUMS.installs, or null when unknown. */
async function visit(url: string): Promise<boolean | null> {
  const key = pageKey(url);
  if (onBoard.has(key) || approved.has(key)) return true;
  if (disqualified.has(key)) return null;
  const page = await skillPage(url).catch((error: unknown) => {
    unread.push(`${url}: ${message(error)}`);
    return undefined;
  });
  if (!page) return null;
  const reaches = (page.installs ?? 0) >= MINIMUMS.installs;
  let c = recorded.get(key);
  if (!c) {
    if (!reaches) return false;
    const [owner, repo, name] = url.replace("https://skills.sh/", "").split("/");
    c = {
      name,
      repo: `${owner}/${repo}`,
      official: page.official,
      stars: null,
      seen: today,
      "skills.sh": { url, installs: null, weeklyInstalls: null, firstSeen: page.firstSeen },
    };
    recorded.set(key, c);
    added.push(`recorded ${url}`);
  }
  fromSitemap++;
  c.official = page.official;
  c.seen = today;
  c["skills.sh"].installs = page.installs;
  c["skills.sh"].weeklyInstalls = page.weeklyInstalls;
  return reaches;
}

// A hundred skills at a time, so that the run of skills under the minimum is counted in order.
let depth = 0;
let under = 0;
while (depth < sitemap.length && under < UNDER_IN_A_ROW) {
  const batch = sitemap.slice(depth, depth + 100).map((url, i) => ({ url, i }));
  const reached: (boolean | null)[] = [];
  await pool(batch, 4, async ({ url, i }) => {
    reached[i] = await visit(url);
  });
  for (const r of reached) under = r === true ? 0 : r === false ? under + 1 : under;
  depth += batch.length;
}
if (unread.length > depth / 100)
  errors.push(`${unread.length} of the sitemap's skill pages didn't read, such as ${unread[0]}`);

// ------------------------------------------------------------------- stars

// For the repos of approved skills and bundles, and of the qualified and unqualified skills the
// crawl just saw, in the top 600 or down the sitemap.
const token = process.env.GITHUB_TOKEN;
const seenToday = [...recorded.values()].filter((c) => c.seen === today);
const repos = new Set([
  ...data.skills.map((s) => github(s).repo),
  ...data.bundles.map(bundleRepo),
  ...seenToday.map((c) => c.repo),
]);
const stars = new Map<string, number>();
// A repo gone from GitHub is an error for an approved skill or bundle only: a skill of crawl.jsonc
// whose repo is gone keeps no stars, so it stays unqualified.
const ours = new Set([...data.skills.map((s) => github(s).repo), ...data.bundles.map(bundleRepo)]);
if (token) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  await pool([...repos], 4, async (repo) => {
    try {
      const json = await get(`https://api.github.com/repos/${repo}`, headers);
      if (json === null) {
        if (ours.has(repo)) errors.push(`repo ${repo}: not found on GitHub`);
      } else stars.set(repo, (JSON.parse(json) as { stargazers_count: number }).stargazers_count);
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

// The minimums decide between qualified and unqualified, from the numbers of today's crawl only: a
// skill it didn't see, in the top 600 or down the sitemap, keeps its state.
const byInstalls = (a: Crawled, b: Crawled) =>
  (b["skills.sh"].installs ?? -1) - (a["skills.sh"].installs ?? -1);
const qualifiedBefore = new Set(crawl.qualified.map((c) => pageKey(c["skills.sh"].url)));
const qualifies = (c: Crawled) =>
  c.seen === today ? passes(c) : qualifiedBefore.has(pageKey(c["skills.sh"].url));
crawl.qualified = [...recorded.values()].filter(qualifies).sort(byInstalls);
crawl.unqualified = [...recorded.values()].filter((c) => !qualifies(c)).sort(byInstalls);
const newlyQualified = crawl.qualified.filter(
  (c) => !qualifiedBefore.has(pageKey(c["skills.sh"].url)),
);
crawl.asOf = today;

writeData(data);
writeCrawl(crawl);

console.log(
  `Crawled the skills.sh top ${board.length}, and ${fromSitemap} skills further down its sitemap, whose first ${depth} it read${unread.length ? ` (${unread.length} pages didn't)` : ""}: refreshed ${data.skills.length} approved skills (${fromPages} from their own page)${stars.size ? ` and the stars of ${stars.size} repos` : ""}. crawl.jsonc: ${crawl.qualified.length} qualified (${newlyQualified.length} new), ${crawl.unqualified.length} unqualified, ${crawl.disqualified.length} disqualified.`,
);
for (const line of added) console.log(`  ${line}`);
for (const c of newlyQualified) console.log(`  qualified ${c["skills.sh"].url}`);
for (const e of errors) console.error(`  failed ${e}`);
if (errors.length) process.exit(1);
