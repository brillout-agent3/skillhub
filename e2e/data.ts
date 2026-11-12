/**
 * What the pages should show, derived from the data files: the data changes every day, so the
 * tests name no number and no skill of their own.
 */

import { existsSync, readFileSync } from "node:fs";
import { readData, root } from "../scripts/data.ts";
import {
  bundlePage,
  bundleRepo,
  github,
  ownerPage,
  repoPage,
  skillPage,
} from "../website/github.ts";
import { renderSkillMd } from "../website/markdown.ts";
import { copyPath } from "../website/skill-md.ts";

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

const mostInstalled = data.skills.toSorted(
  (a, b) => (b["skills.sh"].installs ?? 0) - (a["skills.sh"].installs ?? 0),
);
/** The most installed skill whose SKILL.md, as its page renders it, has what `has` looks for. */
function skillWhoseSkillMd(has: (html: string, text: string) => boolean): string {
  const found = mostInstalled.find((s) => {
    const file = `${root}${copyPath(s)}`;
    if (!existsSync(file)) return false;
    const text = readFileSync(file, "utf8");
    return has(renderSkillMd(text, null).html, text);
  });
  if (!found) throw new Error("no SKILL.md copy has what a test looks for");
  return `/${skillPage(found)}/`;
}
/** The page of a skill whose SKILL.md links to one of its own headings, as a table of contents does. */
export const anchorsUrl = skillWhoseSkillMd((html) => html.includes('href="#md-'));
/** The page of a skill whose SKILL.md has a line of code too long for any screen. */
export const wideCodeUrl = skillWhoseSkillMd(
  (html, text) => html.includes("<pre>") && /^```[\s\S]*?^.{240,}$/m.test(text),
);

/** The page of the skill whose glance has the most of something, which a phone's width has to take. */
function skillWhoseGlanceHasMost(of: (fact: { label: string; text: string }) => number): string {
  const most = (s: (typeof data.skills)[number]) =>
    Math.max(0, ...(s.agentReview.tldr?.glance ?? []).map(of));
  return `/${skillPage(data.skills.toSorted((a, b) => most(b) - most(a))[0])}/`;
}
/** The page of the skill whose glance has the longest label, such as "Unlike <another skill's name>". */
export const longLabelUrl = skillWhoseGlanceHasMost((fact) => fact.label.length);
/**
 * The page of the skill whose glance has the longest run of letters a line can't break in, such as
 * a file's name: a line breaks at a space, and after a hyphen.
 */
export const longWordUrl = skillWhoseGlanceHasMost((fact) =>
  Math.max(...fact.text.split(/[\s-]+/).map((word) => word.length)),
);

/** The stack tags the skills have: stack is the one facet whose values aren't a closed list. */
export const stackTags = new Set(
  data.skills.flatMap((s) => s.agentReview.tags.filter((t) => t.startsWith("stack:"))),
);

/**
 * A tag the search finds only by its meaning: of the facets' values that skills carry and that have
 * a meaning, the most carried, with the longest word of its meaning that its name doesn't hold.
 */
export const meaningTag = data.facets
  .flatMap((f) =>
    (f.values ?? []).map((v) => {
      const tag = f.prefix === false ? v.id : `${f.id}:${v.id}`;
      const name = `${tag} ${v.label ?? ""}`.toLowerCase();
      const word = (v.description ?? "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !name.includes(stem(w)))
        .toSorted((a, b) => b.length - a.length)[0];
      const carried = data.skills.filter((s) => s.agentReview.tags.includes(tag)).length;
      return { tag, word, meaning: v.description ?? "", carried };
    }),
  )
  .filter((t) => t.word && t.carried)
  .toSorted((a, b) => b.carried - a.carried)[0];

/** A bundle to test with: the one with the most skills. */
export const bundle = data.bundles.toSorted(
  (a, b) => b.agentReview.skills.length - a.agentReview.skills.length,
)[0];
export const bundleUrl = `/${bundlePage(bundle)}/`;

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

/** A short page of the same kind, for what reads a whole page, such as axe: the repo with a bundle and the fewest skills. */
export const smallRepo = listings
  .filter((l) => l.bundles.length)
  .toSorted((a, b) => a.skills.length - b.skills.length)[0];
export const smallOwnerUrl = `/${ownerPage(smallRepo.repo)}/`;

/** Its owner, whose page lists every repo of theirs: however their name is spelled, as GitHub ignores case. */
const theirs = listings.filter((l) => ownerPage(l.repo) === ownerPage(repo.repo));
export const owner = {
  url: `/${ownerPage(repo.repo)}/`,
  repos: theirs.length,
  rows: theirs.reduce((rows, l) => rows + l.bundles.length + l.skills.length, 0),
};
