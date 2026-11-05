/**
 * sync.ts — keep the copy of every skill's SKILL.md in data/skill-snapshots/ current.
 *
 * For each skill it fetches the SKILL.md from the HEAD of the skill's GitHub repo. When the text
 * differs from the copy, it rewrites the copy, records the commit in the skill's `skillMd` and
 * recomputes `skew`, how far the text has moved from the SKILL.md the skill's TLDR summarizes.
 * When a bundle's skill changes, it recomputes the bundle's skew too. A skill whose SKILL.md is
 * gone from its repo is skipped: it moves to `skipped` in data/crawl.json, without its agent data.
 *
 * Run: pnpm run sync [id prefix...]
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { readCrawl, readData, root, writeCrawl, writeData } from "./data.ts";
import { get, pool } from "./fetch.ts";
import { copyPath, rawUrl, skew } from "../website/skill-md.ts";
import { github, type Bundle, type Skill, type SkillMd } from "../website/types.ts";

const today = new Date().toISOString().slice(0, 10);
const git = (args: string[]) =>
  promisify(execFile)("git", args, { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).then(
    ({ stdout }) => stdout.trim(),
  );

// ------------------------------------------------------------------- fetching

interface Found {
  version: string;
  text: string;
}

const skillMdIn = (dir: string) => (dir ? `${dir}/SKILL.md` : "SKILL.md");
const raw = (repo: string, commit: string, path: string) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Each repo's HEAD commit, looked up once per run. */
const heads = new Map<string, Promise<string>>();
function head(repo: string): Promise<string> {
  if (!heads.has(repo))
    heads.set(
      repo,
      git(["ls-remote", `https://github.com/${repo}`, "HEAD"]).then((out) => {
        const commit = out.split(/\s/)[0];
        if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${repo}: no HEAD commit`);
        return commit;
      }),
    );
  return heads.get(repo) as Promise<string>;
}

/** The SKILL.md at the HEAD of the skill's repo, or null when it's gone from there. */
async function fetchSkillMd(skill: Skill): Promise<Found | null> {
  const gh = github(skill);
  const version = await head(gh.repo);
  const text = await get(raw(gh.repo, version, skillMdIn(gh.dir)));
  return text === null ? null : { version, text };
}

// ------------------------------------------------------------------- syncing

const changed = new Set<string>();
const gone: Skill[] = [];
const errors: string[] = [];

/** How far `text` is from the SKILL.md the skill's TLDR summarizes. */
async function skewOf(skill: Skill, copy: string | null, text: string): Promise<number> {
  if (!skill.tldr) return skew("", text);
  const url = rawUrl(skill.tldr.permalink);
  const summarized = url ? await get(url).catch(() => null) : null;
  if (summarized !== null) return skew(summarized, text);
  // The summarized SKILL.md can't be fetched: add this change to the skew so far.
  errors.push(`${skill.id}: can't fetch the SKILL.md its TLDR summarizes, ${skill.tldr.permalink}`);
  return (skill.skillMd?.skew ?? 0) + skew(copy ?? "", text);
}

async function save(skill: Skill, copy: string | null, found: Found) {
  let { version, updated, skew: words } = skill.skillMd ?? ({} as SkillMd);
  if (copy !== found.text || !skill.skillMd) {
    const file = join(root, copyPath(skill));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, found.text);
    changed.add(skill.id);
    version = found.version;
    updated = today;
    words = await skewOf(skill, copy, found.text);
  }
  skill.skillMd = { version, updated, skew: words };
}

async function sync(skill: Skill) {
  const file = join(root, copyPath(skill));
  const copy = existsSync(file) ? readFileSync(file, "utf8") : null;
  const before = JSON.stringify(skill.skillMd);
  const found = await fetchSkillMd(skill);
  if (found) await save(skill, copy, found);
  else gone.push(skill);
  if (JSON.stringify(skill.skillMd) !== before) changed.add(skill.id);
}

/** How far a bundle's skills are from the SKILL.md files at the commit its TLDR summarizes. */
async function bundleSkew(bundle: Bundle, skills: Map<string, Skill>): Promise<number> {
  const commit = bundle.tldr && /\/tree\/([0-9a-f]{40})$/.exec(bundle.tldr.permalink)?.[1];
  let words = 0;
  for (const { id } of bundle.skills) {
    const skill = skills.get(id);
    if (!skill) continue;
    const gh = github(skill);
    const text = readFileSync(join(root, copyPath(skill)), "utf8");
    // A skill that's new since that commit counts all its words.
    const summarized = commit ? ((await get(raw(gh.repo, commit, skillMdIn(gh.dir)))) ?? "") : "";
    words += skew(summarized, text);
  }
  return words;
}

const data = readData();
const only = process.argv.slice(2);
const skills = data.skills.filter((s) => !only.length || only.some((p) => s.id.startsWith(p)));
await pool(skills, 8, (skill) =>
  sync(skill).catch((error: Error) => {
    errors.push(`${skill.id}: ${error.message}`);
  }),
);

// Skip the skills gone from their repo, and take them out of their bundles.
if (gone.length) {
  const crawl = readCrawl();
  const ids = new Set(gone.map((s) => s.id));
  for (const skill of gone) {
    crawl.skipped.push({
      url: skill["skills.sh"].url,
      note: `Gone from ${github(skill).repo} since ${today}.`,
    });
    rmSync(join(root, copyPath(skill)), { force: true });
    changed.add(skill.id);
  }
  data.skills = data.skills.filter((s) => !ids.has(s.id));
  for (const bundle of data.bundles) bundle.skills = bundle.skills.filter(({ id }) => !ids.has(id));
  writeCrawl(crawl);
}

const byId = new Map(data.skills.map((s) => [s.id, s]));
for (const bundle of data.bundles)
  if (bundle.skills.some(({ id }) => changed.has(id))) {
    const before = bundle.skew;
    bundle.skew = await bundleSkew(bundle, byId).catch((error: Error) => {
      errors.push(`bundle ${bundle.id}: ${error.message}`);
      return before;
    });
    if (bundle.skew !== before) changed.add(`bundle ${bundle.id}`);
  }

// Drop the copies of skills that left skills.json.
if (!only.length) {
  const kept = new Set(data.skills.map(copyPath));
  const dir = join(root, "data/skill-snapshots");
  for (const file of existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }) : [])
    if (file.endsWith(".md") && !kept.has(`data/skill-snapshots/${file}`)) {
      rmSync(join(dir, file));
      changed.add(`removed copy ${file}`);
    }
}

writeData(data);

console.log(
  `Checked ${skills.length} skills: ${changed.size} changed, ${gone.length} gone from their repo and skipped, ${errors.length} failed.`,
);
for (const id of changed) console.log(`  changed ${id}`);
for (const skill of gone) console.log(`  skipped ${skill.id}: gone from its repo`);
for (const e of errors) console.error(`  failed ${e}`);
if (errors.length) process.exit(1);
