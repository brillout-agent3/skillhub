/**
 * How many skills SkillHub reviewed and why it turned some down, for the intro of the skills list
 * and the about page. Only pages import it, which render at build time, so crawl.jsonc stays out
 * of the client's JavaScript.
 */

import raw from "../data/crawl.jsonc";
import { MINIMUMS } from "../scripts/data.ts";
import type { Crawl } from "../data/types.ts";
import { href } from "./format.ts";
import { data } from "./skills.ts";

const crawl = raw as Crawl;

/** The kinds of verdict an agent gives when it turns a skill down, told apart by its wording. */
const KINDS = [
  ["toolDocs", /^Tool docs/],
  ["language", /^In [A-Z][a-z]+\./],
  ["copy", /copy of|old name/i],
  ["retired", /^(Retired|Deprecated)/i],
] as const;
type Kind = (typeof KINDS)[number][0] | "other";

const turnedDown: Record<Kind, number> = {
  toolDocs: 0,
  language: 0,
  copy: 0,
  retired: 0,
  other: 0,
};
let gone = 0;
let notOnGitHub = 0;
for (const { reason } of crawl.disqualified) {
  if ("agentReview" in reason)
    turnedDown[KINDS.find(([, re]) => re.test(reason.agentReview.note))?.[0] ?? "other"]++;
  else if ("goneFromRepo" in reason) gone++;
  else notOnGitHub++;
}

export const review = {
  /** The skills the site lists. */
  listed: data.skills.length,
  bundles: data.bundles.length,
  /** Every skill that got a verdict: listed, or disqualified for any reason. */
  reviewed: data.skills.length + crawl.disqualified.length,
  turnedDown,
  gone,
  notOnGitHub,
  /** Qualified, waiting for an agent. */
  waiting: crawl.qualified.length,
  /** Found by the crawl, but under the minimums. */
  under: crawl.unqualified.length,
  minimums: MINIMUMS,
  asOf: data.asOf.installs,
};

const n = (x: number) => x.toLocaleString("en");

/** The skills list's opening line. */
export const introHtml = () =>
  `<p class="intro"><b>${n(review.listed)} curated skills</b> <a href="${href("about/")}"><small>From ${n(review.reviewed)} reviewed skills.</small></a></p>`;
