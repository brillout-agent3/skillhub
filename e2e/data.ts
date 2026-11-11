/**
 * What the pages should show, derived from the data files: the data changes every day, so the
 * tests name no number and no skill of their own.
 */

import { readData } from "../scripts/data.ts";
import { bundleRepo, github, ownerPage, repoPage, skillPage } from "../website/github.ts";

export const data = readData();

const members = new Map(
  data.bundles.flatMap((b) => b.agentReview.skills.map((m) => [m.id, m] as const)),
);
/** The skills with a row of their own in the list: those in no bundle, or listed outside theirs. */
const alone = data.skills.filter((s) => {
  const member = members.get(s.id);
  return !member || member.listedOutsideBundle === true;
});

/** How many rows the unfiltered list has: every bundle, and every skill with a row of its own. */
export const listedRows = data.bundles.length + alone.length;

/** A search's word as the list's search cuts it: see `words` in website/list.ts. */
const stem = (w: string) =>
  w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
const names = [...data.skills.map((s) => s.name), ...data.bundles.map((b) => b.agentReview.name)];

/**
 * A skill to test with, the most installed that fits: in no bundle, so its row and its page stand
 * alone, and named like no other skill or bundle, so a search for its name ranks it first.
 */
export const skill = data.skills
  .filter(
    (s) =>
      !members.has(s.id) &&
      names.filter((name) => name.toLowerCase().includes(stem(s.name.toLowerCase()))).length === 1,
  )
  .toSorted((a, b) => (b["skills.sh"].installs ?? 0) - (a["skills.sh"].installs ?? 0))[0];
export const skillUrl = `/${skillPage(skill)}/`;

/** A bundle to test with: the one with the most skills. */
export const bundle = data.bundles.toSorted(
  (a, b) => b.agentReview.skills.length - a.agentReview.skills.length,
)[0];
export const bundleUrl = `/bundle/${bundle.id}/`;

/** What a repo's page lists: its bundles, then every skill of the repo. */
const listing = (repo: string) => ({
  repo,
  url: `/${repoPage(repo)}/`,
  bundles: data.bundles.filter((b) => bundleRepo(b) === repo),
  skills: data.skills.filter((s) => github(s).repo === repo),
});
/** The repos with a skill on the site, each of which has a page. */
const listings = [...new Set(data.skills.map((s) => github(s).repo))].map(listing);

/** A repo to test with: of those with a bundle, the one with the most skills. */
export const repo = listings
  .filter((l) => l.bundles.length)
  .toSorted((a, b) => b.skills.length - a.skills.length)[0];

/** Its owner, whose page lists every repo of theirs: however their name is spelled, as GitHub ignores case. */
const theirs = listings.filter((l) => ownerPage(l.repo) === ownerPage(repo.repo));
export const owner = {
  url: `/${ownerPage(repo.repo)}/`,
  repos: theirs.length,
  rows: theirs.reduce((rows, l) => rows + l.bundles.length + l.skills.length, 0),
};
