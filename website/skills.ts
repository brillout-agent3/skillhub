/** The data behind every page, ../data/skills.jsonc, and what the pages derive from it. */

import raw from "../data/skills.jsonc";
import { esc, href, plural } from "./format.ts";
import type { Bundle, BundleSkill, Data, Facet, Skill, Tldr } from "../data/types.ts";
import { bundleRepo, github } from "./github.ts";

export const data = raw as Data;
export const GITHUB = "https://github.com/brillout/skillhub";

export const facetById = new Map(data.facets.map((f) => [f.id, f]));
export const repoById = new Map(data.repos.map((r) => [r.id, r]));
export const skillById = new Map(data.skills.map((s) => [s.id, s]));
export const bundleById = new Map(data.bundles.map((b) => [b.id, b]));
/** The bundle a skill is in, and its place there. */
export const bundleOf = new Map<string, BundleSkill & { bundle: Bundle; index: number }>();
for (const bundle of data.bundles)
  bundle.agentReview.skills.forEach((m, index) => bundleOf.set(m.id, { ...m, bundle, index }));
/** Whether a skill gets an entry of its own in the skills list, rather than only inside its bundle. */
export const ownEntry = (s: Skill) => bundleOf.get(s.id)?.standalone ?? true;
// Every skill is on skills.sh; a bundle isn't.
export const isBundle = (e: Skill | Bundle): e is Bundle => !("skills.sh" in e);
export const nameOf = (e: Skill | Bundle) => (isBundle(e) ? e.agentReview.name : e.name);
export const skillsOf = (b: Bundle) =>
  b.agentReview.skills.map(({ id }) => skillById.get(id) as Skill);

/** Tags are `facet:value`, except topics, which are written without a prefix. */
export const tagOf = (facet: Facet, value: string) =>
  facet.prefix === false ? value : `${facet.id}:${value}`;
export const facetOf = (tag: string) =>
  tag.includes(":") ? tag.slice(0, tag.indexOf(":")) : "topic";
export const tagInfo = new Map<string, string>();
const labels = new Map<string, string>();
/** The parents each tag has through `includes`, such as category:software-engineering for category:debugging. */
const parents = new Map<string, string[]>();
for (const facet of data.facets)
  for (const v of facet.values) {
    const tag = tagOf(facet, v.id);
    if (v.description) tagInfo.set(tag, v.description);
    if (v.label) labels.set(tag, v.label);
    for (const child of v.includes ?? [])
      parents.set(tagOf(facet, child), [...(parents.get(tagOf(facet, child)) ?? []), tag]);
  }
/** A tag's name for chips, when it has one besides the tag itself. */
export const tagLabel = (tag: string) => labels.get(tag);
/** The values a parent tag includes, as tags. */
export const includedBy = (tag: string) =>
  [...parents].filter(([, of]) => of.includes(tag)).map(([child]) => child);
/** The parents a tag has through `includes`. */
export const parentsOf = (tag: string) => parents.get(tag) ?? [];
const withParents = new Map(
  data.skills.map((s) => [
    s.id,
    [...s.agentReview.tags, ...new Set(s.agentReview.tags.flatMap((t) => parents.get(t) ?? []))],
  ]),
);
/** A skill's tags, plus the parents it has through them. */
export const tagsOf = (s: Skill) => withParents.get(s.id) ?? s.agentReview.tags;

/** The order facets appear in, wherever they're listed. */
export const FACET_ORDER = ["category", "type", "effect", "needs", "by", "topic", "stack", "flag"];
/** Tags that call for a look before installing. */
export const CAUTION = ["flag:republished"];

const most = (n: (number | null)[]) => {
  const known = n.filter((x) => x !== null);
  return known.length ? Math.max(...known) : null;
};

// A bundle's numbers are those of its skills: the most installs any one of them has, and the
// first time one was seen.

/** The GitHub repo a skill or bundle lives in. */
export const repoKey = (e: Skill | Bundle) => (isBundle(e) ? bundleRepo(e) : github(e).repo);
export const starsOf = (e: Skill | Bundle) => repoById.get(repoKey(e))?.stars ?? null;
export const installsOf = (e: Skill | Bundle): number | null =>
  isBundle(e) ? most(skillsOf(e).map(installsOf)) : e["skills.sh"].installs;
export const firstSeenOf = (e: Skill | Bundle): string | null =>
  isBundle(e)
    ? (skillsOf(e).map(firstSeenOf).filter(Boolean).sort()[0] ?? null)
    : e["skills.sh"].firstSeen;
/** Installs on skills.sh in the latest of its 8 weeks. */
export const weekOf = (e: Skill | Bundle): number | null => {
  if (isBundle(e)) return most(skillsOf(e).map(weekOf));
  const weekly = e["skills.sh"].weeklyInstalls;
  return weekly?.length ? weekly[weekly.length - 1] : null;
};

/** Compare for a descending sort, unknown values last. */
export const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

/** An id as URL path segments; `@` stays as is. */
export const idPath = (id: string) =>
  id
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%40/g, "@"))
    .join("/");
/** The skill's own page. */
export const skillHref = (id: string) => href(`skill/${idPath(id)}/`);
/** The bundle's page. */
export const bundleHref = (id: string) => href(`bundle/${idPath(id)}/`);

/** A TLDR's glance as a list of labelled facts, or its first `max` items. */
export function glanceHtml(glance: Tldr["glance"], max = glance.length): string {
  const items = glance
    .slice(0, max)
    .map(({ label, text }) => `<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`);
  return `<dl class="glance">${items.join("")}</dl>`;
}

/** A tag, as a link to `link`, or with no link as a toggle for the skills list's filters. */
export function tagChip(tag: string, link: string | null, pressed = false): string {
  const info = tagInfo.get(tag);
  const attrs = `class="tag" data-tag="${esc(tag)}" data-facet="${esc(facetOf(tag))}"${info ? ` title="${esc(info)}"` : ""}`;
  return link === null
    ? `<button type="button" ${attrs} aria-pressed="${pressed}">${esc(tag)}</button>`
    : `<a ${attrs} href="${link}">${esc(tag)}</a>`;
}

/** A commit as its first 7 characters. */
export const short = (commit: string) => commit.slice(0, 7);

/** The TLDR's prose, and what it summarizes: `what` at the permalink's commit, which has changed by `skew` words since. */
export function tldrHtml(tldr: Tldr, what: string, skew: number): string {
  const commit = /\/tree\/([0-9a-f]{40})/.exec(tldr.permalink)?.[1] ?? "";
  return `
    <section class="tldr" aria-labelledby="tldr">
      <h2 id="tldr">TLDR</h2>
      ${tldr.text
        .split(/\n\s*\n/)
        .map((p) => `<p>${esc(p)}</p>`)
        .join("")}
      <p class="muted">Summarizes <a href="${esc(tldr.permalink)}">${esc(what)} at ${short(commit)}</a>.${
        skew
          ? ` ${what === "the skill" ? "Its SKILL.md has" : "Its skills have"} changed by ${plural(skew, "word")} since.`
          : ""
      }</p>
    </section>`;
}
