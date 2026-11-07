/**
 * tldr.ts — find the skills whose TLDR is missing or behind their SKILL.md, and set TLDRs.
 *
 * Run: pnpm run tldr [count]        the skills and bundles with the largest skew first: skew, id,
 *                                   the copies to read
 *      pnpm run tldr <id> --model <model> --effort <effort> <json>
 *                                   set a skill's or a bundle's TLDR, as written by that model at
 *                                   that effort, such as --model "Claude Opus 5.5" --effort xhigh
 *                                   (--effort unknown when you don't know it):
 *                                   {"glance": [{"label", "text"}], "text"} (or pipe the JSON in)
 *
 * Setting a TLDR resets the skew to 0 and records a permalink to what the TLDR summarizes: the skill's directory at the
 * commit its copy in data/skill-snapshots/ was taken from. For a bundle, it's the repo at its
 * current commit, which its skills' copies must match.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readData, root, tldrProblems, writeData } from "./data.ts";
import { copyPath, rawUrl } from "../website/skill-md.ts";
import type { Bundle, Skill, Tldr } from "../data/types.ts";
import { bundleRepo, github } from "../website/github.ts";

const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

/** The permalink to what a TLDR written from the skill's copy summarizes. */
function permalink(skill: Skill): string {
  if (!skill.skillMd) throw new Error(`${skill.id} has no copy yet; run pnpm run sync`);
  const gh = github(skill);
  return `https://github.com/${gh.repo}/tree/${skill.skillMd.version}${gh.dir ? `/${gh.dir}` : ""}`;
}

/** The permalink to a bundle's repo at its current commit, once its skills' copies are checked against it. */
async function bundlePermalink(bundle: Bundle): Promise<string> {
  const repo = bundleRepo(bundle);
  const commit = git("ls-remote", `https://github.com/${repo}`, "HEAD").split(/\s/)[0];
  const behind: string[] = [];
  for (const { id } of bundle.agentReview.skills) {
    const skill = skillOf(id);
    const { dir } = github(skill);
    const res = await fetch(
      rawUrl(`https://github.com/${repo}/tree/${commit}${dir ? `/${dir}` : ""}`) ?? "",
    );
    if (!res.ok || (await res.text()) !== readFileSync(`${root}${copyPath(skill)}`, "utf8"))
      behind.push(id);
  }
  if (behind.length)
    throw new Error(
      `run pnpm run sync ${repo} first: ${behind.join(", ")} changed since their copy`,
    );
  return `https://github.com/${repo}/tree/${commit}`;
}

const data = readData();
const skillOf = (id: string) => {
  const skill = data.skills.find((s) => s.id === id);
  if (!skill) throw new Error(`no skill ${id}`);
  return skill;
};
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
/** The arguments, without --model and --effort, which say who writes the TLDR. */
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const model = flag("model");
const effort = flag("effort");
const [first, ...rest] = args;

if (!first || /^\d+$/.test(first)) {
  const list = [
    ...data.skills.map((s) => ({
      skew: s.skillMd?.skew,
      id: s.id,
      read: [copyPath(s)],
      tldr: s.agentReview.tldr,
    })),
    ...data.bundles.map((b) => ({
      skew: b.skew,
      id: b.id,
      read: b.agentReview.skills.map(({ id }) => copyPath(skillOf(id))),
      tldr: b.agentReview.tldr,
    })),
  ].sort((a, b) => (b.skew ?? 0) - (a.skew ?? 0));
  for (const e of list.slice(0, first ? Number(first) : undefined))
    console.log(`${e.skew ?? "?"}\t${e.id}\t${e.read.join(" ")}${e.tldr ? "" : "\t(no TLDR)"}`);
} else {
  const bundle = data.bundles.find((b) => b.id === first);
  const skill = bundle ? null : skillOf(first);
  if (!model || !effort)
    throw new Error(
      'say who writes the TLDR: --model "Claude Opus 5.5" --effort xhigh (or unknown)',
    );
  if (effort !== "unknown" && !(EFFORTS as readonly string[]).includes(effort))
    throw new Error(`--effort must be ${EFFORTS.join(", ")} or unknown`);
  const author = {
    model,
    effort: effort === "unknown" ? null : (effort as (typeof EFFORTS)[number]),
  };
  const input = (rest.length ? rest.join(" ") : readFileSync(0, "utf8")).trim();
  const { glance, text } = JSON.parse(input) as Pick<Tldr, "glance" | "text">;
  const problems = tldrProblems({ glance, text });
  if (problems.length) throw new Error(problems.join("; "));
  const tldr: Tldr = {
    glance,
    text,
    permalink: skill ? permalink(skill) : await bundlePermalink(bundle as Bundle),
  };
  if (skill) {
    Object.assign(skill.agentReview, { tldr }, author);
    if (skill.skillMd) skill.skillMd.skew = 0;
  } else if (bundle) {
    Object.assign(bundle.agentReview, { tldr }, author);
    bundle.skew = 0;
  }
  writeData(data);
  console.log(`${first}: TLDR set, summarizing ${tldr.permalink}`);
}
