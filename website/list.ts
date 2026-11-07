/**
 * The skills list: its filters, which live in the URL query so every filtered list can be shared
 * as a link, and its HTML. The page is pre-rendered unfiltered; its client script re-renders it.
 */

import { compact, date, esc, href, plural } from "./format.ts";
import {
  CAUTION,
  FACET_ORDER,
  bundleHref,
  bundleOf,
  data,
  facetById,
  facetOf,
  firstSeenOf,
  idPath,
  includedBy,
  glanceHtml,
  installsOf,
  isBundle,
  nameOf,
  ownEntry,
  parentsOf,
  repoById,
  repoKey,
  growthOf,
  GROWTH_MIN,
  skillById,
  skillHref,
  skillsOf,
  starsOf,
  tagChip,
  tagInfo,
  tagLabel,
  tagOf,
  tagsOf,
  weekOf,
} from "./skills.ts";
import type { Bundle, Skill } from "../data/types.ts";

/** A row of the skills list: a skill, or a bundle with its skills inside. */
type Entry = Skill | Bundle;

/** Tags the list's rows leave to the skill's page: ones that hold for most skills, and categories, which the filters already show. */
const quiet = (tag: string) => tag === "by:community" || facetOf(tag) === "category";

// ------------------------------------------------------------------- state

/**
 * Buttons that only set the list's settings, highest first: Top by downloads, Hot by how fast the
 * weekly downloads grow, one per repo (a repo's skills tend to grow together), New by publishing
 * date.
 */
export type Preset = "top" | "hot" | "new";
export const PRESETS: Record<Preset, { label: string; sort: Sort; one: boolean; title: string }> = {
  top: { label: "Top", sort: "downloads", one: false, title: "Most downloaded of all time" },
  hot: { label: "Hot", sort: "growth", one: true, title: "Downloads growing the fastest" },
  new: { label: "New", sort: "published", one: false, title: "Most recently published" },
};

/** The numbers every row shows, which the list sorts by and the sliders filter on. */
export type Prop = "published" | "stars" | "downloads" | "week";
type Value = number | string;
interface PropInfo {
  label: string;
  /** The entry's value, or null when unknown. Dates are YYYY-MM-DD. */
  of: (e: Entry) => Value | null;
  /** Where the value comes from, for its tooltip. */
  title: (e: Entry) => string;
  /** The slider's stops, lowest first. The last one is above every value, so the full range includes them all. */
  stops: Value[];
  date?: boolean;
}

/** 0, 10, 20, 50, 100… up past the largest value. */
function countStops(of: (s: Skill) => number | null): number[] {
  const max = Math.max(0, ...data.skills.map(of).filter((n) => n !== null));
  const stops = [0];
  for (let p = 10; stops[stops.length - 1] <= max; p *= 10) stops.push(p, 2 * p, 5 * p);
  return stops.slice(0, stops.findIndex((n) => n > max) + 1);
}
/** The first of each month, from the earliest date's month to the month after the latest's. */
function monthStops(of: (s: Skill) => string | null): string[] {
  const dates = data.skills
    .map(of)
    .filter((d) => d !== null)
    .sort();
  if (!dates.length) return ["", "~"];
  const stops: string[] = [];
  let [y, m] = dates[0].split("-").map(Number);
  for (;;) {
    stops.push(`${y}-${String(m).padStart(2, "0")}-01`);
    if (stops[stops.length - 1] > dates[dates.length - 1]) return stops;
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
}

// A bundle's numbers are its most popular skill's.
const most = (e: Entry) => (isBundle(e) ? "The most of any of its skills: " : "");
export const PROPS: Record<Prop, PropInfo> = {
  published: {
    label: "Published",
    of: firstSeenOf,
    title: (e) =>
      isBundle(e) ? "When skills.sh first saw one of its skills" : "When skills.sh first saw it",
    stops: monthStops(firstSeenOf),
    date: true,
  },
  stars: {
    label: "Stars",
    of: starsOf,
    title: (e) => `GitHub stars of ${repoKey(e)}, ${date(data.asOf.stars)}`,
    stops: countStops(starsOf),
  },
  downloads: {
    label: "Total Downloads",
    of: installsOf,
    title: (e) => `${most(e)}All-time installs on skills.sh, ${date(data.asOf.installs)}`,
    stops: countStops(installsOf),
  },
  week: {
    label: "Weekly Downloads",
    of: weekOf,
    title: (e) => `${most(e)}Installs on skills.sh in the week to ${date(data.asOf.installs)}`,
    stops: countStops(weekOf),
  },
};
const PROP_IDS = Object.keys(PROPS) as Prop[];
const lastStop = (p: Prop) => PROPS[p].stops.length - 1;

/** A slider's range, as indexes into its stops: `lo` included, `hi` excluded. */
export type Range = [lo: number, hi: number];
export const fullRange = (p: Prop): Range => [0, lastStop(p)];
const fullRanges = () =>
  Object.fromEntries(PROP_IDS.map((p) => [p, fullRange(p)])) as Record<Prop, Range>;
export const isNarrowed = (p: Prop, [lo, hi]: Range) => lo > 0 || hi < lastStop(p);

const monthYear = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
/** A slider's range in words, such as "≥ 1K" or "Mar 2026 – May 2026". */
export function rangeLabel(p: Prop, [lo, hi]: Range): string {
  const { stops, date } = PROPS[p];
  if (date) {
    const month = (i: number) => monthYear.format(new Date(`${stops[i]}T00:00:00Z`));
    // `hi` is excluded, so the range ends with the month before it.
    const from = lo > 0 ? month(lo) : null;
    const to = hi < lastStop(p) ? month(hi - 1) : null;
    return from && to
      ? from === to
        ? from
        : `${from} – ${to}`
      : from
        ? `Since ${from}`
        : to
          ? `Until ${to}`
          : "Any";
  }
  const from = lo > 0 ? compact(stops[lo] as number) : null;
  const to = hi < lastStop(p) ? compact(stops[hi] as number) : null;
  return from && to ? `${from} – ${to}` : from ? `≥ ${from}` : to ? `< ${to}` : "Any";
}

/**
 * A number to sort by; "growth", how fast the weekly downloads grow (a sort only: it can be
 * negative or infinite, so it gets no slider); or "match", how well the entry matches the search,
 * for when there is one.
 */
export type Sort = Prop | "growth" | "match";
const GROWTH = {
  label: "Weekly Growth",
  title: (e: Entry) =>
    `${isBundle(e) ? "The most of any of its skills: " : ""}Installs on skills.sh in an average week of the 2 to ${date(data.asOf.installs)}, against an average week of the 4 before. Only for skills with at least ${compact(GROWTH_MIN)} a week.`,
};
/** A growth as a percentage with its sign, such as +180% or −12%, or "new" when it had no downloads before. */
const percent = (g: number) =>
  g === Infinity
    ? "new"
    : `${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.round(Math.abs(g) * 100).toLocaleString("en")}%`;
/** A search sorts by best match unless another sort is picked; otherwise the list sorts by downloads. */
export const defaultSort = (q: string): Sort => (q ? "match" : "downloads");
export interface State {
  q: string;
  tags: string[];
  repo: string | null;
  sort: Sort;
  /** Lowest (or oldest) first, instead of highest first. */
  asc: boolean;
  ranges: Record<Prop, Range>;
  /** One entry per repo: the most popular one stands for the rest. */
  one: boolean;
}

export function parse(search: string): State {
  const p = new URLSearchParams(search);
  const sort = p.get("sort") as Sort | null;
  const q = p.get("q") ?? "";
  const ranges = fullRanges();
  for (const prop of PROP_IDS) {
    // Such as stars=1000..50000, or published=2026-03-01.. with no upper bound.
    const [lo, hi] = (p.get(prop) ?? "").split("..");
    const stops = PROPS[prop].stops.map(String);
    if (lo && stops.includes(lo)) ranges[prop][0] = stops.indexOf(lo);
    if (hi && stops.includes(hi) && stops.indexOf(hi) > ranges[prop][0])
      ranges[prop][1] = stops.indexOf(hi);
  }
  return {
    q,
    tags: p.getAll("tag"),
    repo: p.get("repo"),
    sort:
      sort && (sort in PROPS || sort === "growth" || (sort === "match" && q))
        ? sort
        : defaultSort(q),
    asc: p.get("order") === "asc",
    ranges,
    one: p.get("one") === "1",
  };
}
/** The query string for a state, empty for the unfiltered list. */
export function query(s: State): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  for (const t of s.tags) p.append("tag", t);
  if (s.repo) p.set("repo", s.repo);
  if (s.sort !== defaultSort(s.q)) p.set("sort", s.sort);
  if (s.asc) p.set("order", "asc");
  for (const prop of PROP_IDS) {
    const [lo, hi] = s.ranges[prop];
    if (isNarrowed(prop, [lo, hi]))
      p.set(
        prop,
        `${lo > 0 ? PROPS[prop].stops[lo] : ""}..${hi < lastStop(prop) ? PROPS[prop].stops[hi] : ""}`,
      );
  }
  if (s.one) p.set("one", "1");
  const q = p.toString();
  return q ? `?${q}` : "";
}
export const fresh = (): State => parse("");
/**
 * Select or unselect a tag. Selecting one unselects its parents and the tags it includes, since
 * either would only repeat or widen it: picking Design under Software engineering narrows the list
 * to design, and picking Software engineering again widens it back.
 */
export function toggleTag(tags: string[], tag: string): string[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  const related = [...parentsOf(tag), ...includedBy(tag)];
  return [...tags.filter((t) => !related.includes(t)), tag];
}

/** A link to the skills list filtered to the given state changes. */
export const skillsLink = (patch: Partial<State>) => href() + query({ ...fresh(), ...patch });

// ------------------------------------------------------------------- filtering

const searchText = new Map(
  data.skills.map((s) => [
    s.id,
    [
      s.name,
      s.agentReview.description,
      ...(s.agentReview.tldr?.glance.map((g) => g.text) ?? []),
      s.agentReview.tldr?.text,
      repoKey(s),
      s.agentReview.note,
      ...tagsOf(s),
      ...tagsOf(s).map(tagLabel),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  ]),
);
const bundleText = new Map(
  data.bundles.map((b) => [
    b.id,
    [
      b.agentReview.name,
      b.agentReview.description,
      ...(b.agentReview.tldr?.glance.map((g) => g.text) ?? []),
      b.agentReview.tldr?.text,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  ]),
);
/** The search's words, plurals cut back so they match the singular too: "resumes" finds "resume", "strategies" finds "strategy". */
const words = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w,
    );
const matches = (text: string, q: string) => words(q).every((word) => text.includes(word));

/**
 * For sorting a search by best match: each word of it scores where it appears, a name the most,
 * then the description, the TLDR's glance and the tags, the repo, and last the TLDR's text and the
 * note. A name holding the whole search scores extra.
 */
type Fields = [text: string, weight: number][];
const fields = (parts: [string | null | undefined, number][]): Fields =>
  parts.filter((p): p is [string, number] => Boolean(p[0])).map(([t, w]) => [t.toLowerCase(), w]);
const skillFields = new Map(
  data.skills.map((s) => [
    s.id,
    fields([
      [s.name, 8],
      [s.agentReview.description, 4],
      [s.agentReview.tldr?.glance.map((g) => g.text).join(" "), 3],
      [[...tagsOf(s), ...tagsOf(s).map(tagLabel)].filter(Boolean).join(" "), 3],
      [repoKey(s), 2],
      [s.agentReview.tldr?.text, 1],
      [s.agentReview.note, 1],
    ]),
  ]),
);
const bundleFields = new Map(
  data.bundles.map((b) => [
    b.id,
    fields([
      [b.agentReview.name, 8],
      [b.agentReview.description, 4],
      [b.agentReview.tldr?.glance.map((g) => g.text).join(" "), 3],
      [repoKey(b), 2],
      [b.agentReview.tldr?.text, 1],
    ]),
  ]),
);
/** A word counts in full where it starts a word, and a quarter inside one, such as "cad" in "academic". */
function score(f: Fields, q: string): number {
  const ws = words(q).map((w) => ({
    w,
    start: new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"),
  }));
  const name = f[0]?.[1] === 8 ? f[0][0] : "";
  const phrase = q.trim().toLowerCase();
  return (
    ws.reduce(
      (n, { w, start }) =>
        n + Math.max(0, ...f.map(([t, wt]) => (start.test(t) ? wt : t.includes(w) ? wt / 4 : 0))),
      0,
    ) + (phrase && name.includes(phrase) ? 4 : 0)
  );
}
/** A bundle matches as well as itself or its best matching skill. */
const matchScore = (e: Entry, q: string): number =>
  isBundle(e)
    ? Math.max(
        score(bundleFields.get(e.id) ?? [], q),
        ...skillsOf(e).map((s) => score(skillFields.get(s.id) ?? [], q)),
      )
    : score(skillFields.get(e.id) ?? [], q);

/** Within a facet a skill needs any selected value; across facets it needs all of them. `skip` leaves one facet out, for its counts. */
function passes(s: Skill, st: State, skip: string | null = null): boolean {
  if (st.repo && repoKey(s) !== st.repo) return false;
  for (const p of PROP_IDS) {
    const [lo, hi] = st.ranges[p];
    if (!isNarrowed(p, [lo, hi])) continue;
    const v = PROPS[p].of(s);
    if (v === null || v < PROPS[p].stops[lo] || v >= PROPS[p].stops[hi]) return false;
  }
  const selected = new Map<string, string[]>();
  for (const t of st.tags) selected.set(facetOf(t), [...(selected.get(facetOf(t)) ?? []), t]);
  for (const [facet, tags] of selected)
    if (facet !== skip && !tags.some((t) => tagsOf(s).includes(t))) return false;
  return !st.q || matches(searchText.get(s.id) ?? "", st.q);
}

/** A bundle shows when one of its skills does, or when the search matches the bundle itself and one of its skills matches the other filters. */
function bundlePasses(b: Bundle, st: State): boolean {
  const skills = skillsOf(b);
  return (
    skills.some((s) => passes(s, st)) ||
    (Boolean(st.q) &&
      matches(bundleText.get(b.id) ?? "", st.q) &&
      skills.some((s) => passes(s, { ...st, q: "" })))
  );
}

const isFiltered = (st: State) =>
  Boolean(st.q || st.tags.length || st.repo) || PROP_IDS.some((p) => isNarrowed(p, st.ranges[p]));

/** On a tie, such as a bundle and its most installed skill, the bundle goes first. */
const bundleFirst = (a: Entry, b: Entry) => Number(isBundle(b)) - Number(isBundle(a));
/** Compare for a descending sort, unknown values last. */
const descending = (a: Value | null, b: Value | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1;
/** Compare for an ascending sort, unknown values still last. */
const ascending = (a: Value | null, b: Value | null) =>
  a === null || b === null ? descending(a, b) : -descending(a, b);
const order = (sort: Sort, asc: boolean, q: string) => (a: Entry, b: Entry) =>
  (sort === "match"
    ? matchScore(b, q) - matchScore(a, q)
    : sort === "growth"
      ? (asc ? ascending : descending)(growthOf(a), growthOf(b))
      : (asc ? ascending : descending)(PROPS[sort].of(a), PROPS[sort].of(b))) ||
  descending(installsOf(a), installsOf(b)) ||
  bundleFirst(a, b) ||
  nameOf(a).localeCompare(nameOf(b));

/** The filtered, sorted list, plus how many entries each repo hides in one-per-repo mode. Skills that only work inside their bundle are listed in it. */
function results(st: State): {
  list: Entry[];
  hidden: Map<string, number>;
  total: number;
  bundles: number;
} {
  const matching = [
    ...data.bundles.filter((b) => bundlePasses(b, st)),
    ...data.skills.filter((s) => ownEntry(s) && passes(s, st)),
  ].sort(order(st.sort, st.asc, st.q));
  const hidden = new Map<string, number>();
  const counted = { total: matching.length, bundles: matching.filter(isBundle).length };
  if (!st.one) return { list: matching, hidden, ...counted };
  const list = matching.filter((s) => {
    const key = repoKey(s);
    if (hidden.has(key)) {
      hidden.set(key, (hidden.get(key) ?? 0) + 1);
      return false;
    }
    hidden.set(key, 0);
    return true;
  });
  return { list, hidden, ...counted };
}

function counts(st: State, facet: string, valuesOf: (s: Skill) => string[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const s of data.skills)
    if (passes(s, st, facet)) for (const v of valuesOf(s)) n.set(v, (n.get(v) ?? 0) + 1);
  return n;
}

// ------------------------------------------------------------------- asking an agent

/** The active filters in words, the search left out. */
function filtersText(st: State): string[] {
  const parts = st.tags.map((t) => `tag ${t}`);
  if (st.repo) parts.push(`from ${st.repo}`);
  for (const p of PROP_IDS)
    if (isNarrowed(p, st.ranges[p]))
      parts.push(`${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`);
  return parts;
}

/**
 * A prompt to paste into any chat agent, for a need in your own words, which the search can't
 * match: the catalog is every entry the filters leave, the search is ignored and taken as the need
 * instead. `base` is the site's absolute URL, which the entries' paths are relative to.
 */
export function askPrompt(st: State, base: string): string {
  const { list } = results({ ...st, q: "", one: false });
  const entry = (e: Entry) => {
    const review = e.agentReview;
    const numbers = [
      installsOf(e) !== null ? `${compact(installsOf(e) as number)} installs` : "",
      starsOf(e) !== null ? `${compact(starsOf(e) as number)} stars` : "",
    ].filter(Boolean);
    const head = isBundle(e)
      ? `### ${nameOf(e)} (bundle/${idPath(e.id)}/): a bundle of ${skillsOf(e)
          .map((s) => s.name)
          .join(", ")}`
      : `### ${e.name} (skill/${idPath(e.id)}/)`;
    const tags = isBundle(e) ? [] : e.agentReview.tags.filter((t) => !quiet(t));
    const facts = review.tldr?.glance.map((g) => `- ${g.label}: ${g.text}`) ?? [
      `- ${review.description}`,
    ];
    return [
      head,
      [repoKey(e), ...numbers, tags.length ? `tags: ${tags.join(", ")}` : ""]
        .filter(Boolean)
        .join(" · "),
      ...facts,
    ].join("\n");
  };
  const filters = filtersText(st);
  return `I'm looking for an agent skill: a SKILL.md that teaches a coding agent (Claude Code, Codex, Cursor…) how to do something. Below is the catalog of SkillHub, a directory of agent-reviewed skills${
    filters.length ? `, narrowed to: ${filters.join("; ")}` : ""
  }.

Using only this catalog, pick the skills that best fit my need, best first, at most 5. For each, give its name, its link, why it fits, and anything that could make it a poor fit (what it needs, what it won't do). If skills fit only together, say so. If none fits well, say so plainly. If my need is too vague to choose, ask me first.

Each entry's link is its path in parentheses, after ${base}

# Catalog (${list.length} entries)

${list.map(entry).join("\n\n")}

# My need

${st.q}`;
}

// ------------------------------------------------------------------- pieces

function filterChip(
  attr: string,
  value: string,
  label: string,
  n: number,
  pressed: boolean,
  title?: string,
): string {
  return `<button type="button" class="chip" ${attr}="${esc(value)}" aria-pressed="${pressed}"${
    title ? ` title="${esc(title)}"` : ""
  }><span>${esc(label)}</span><span class="n">${n}</span></button>`;
}

/** The row's numbers, top right, with the one the list is sorted by highlighted. */
function propsHtml(e: Entry, st: State): string {
  const rows = PROP_IDS.map((p) => {
    const v = PROPS[p].of(e);
    const shown = v === null ? "—" : PROPS[p].date ? date(v as string) : compact(v as number);
    return `<div${p === st.sort ? ` class="on"` : ""}${v === null ? "" : ` title="${esc(PROPS[p].title(e))}"`}><dt>${PROPS[p].label}</dt><dd>${shown}</dd></div>`;
  });
  // The growth shows only while the list is sorted by it, to explain the order.
  if (st.sort === "growth") {
    const g = growthOf(e);
    rows.push(
      `<div class="on" title="${esc(GROWTH.title(e))}"><dt>${GROWTH.label}</dt><dd>${g === null ? "—" : percent(g)}</dd></div>`,
    );
  }
  return `<dl class="props">${rows.join("")}</dl>`;
}

const moreLink = (e: Entry, more: number, st: State) =>
  more
    ? `<a class="more" href="${skillsLink({ repo: repoKey(e), sort: st.sort === "match" ? defaultSort("") : st.sort, asc: st.asc })}">+${more} more from ${esc(repoKey(e))}</a>`
    : "";

function skillRow(s: Skill, more: number, st: State): string {
  const tags = s.agentReview.tags
    .filter((t) => !quiet(t))
    .sort((a, b) => FACET_ORDER.indexOf(facetOf(a)) - FACET_ORDER.indexOf(facetOf(b)));
  const caution = s.agentReview.tags.some((t) => CAUTION.includes(t));
  const bundle = bundleOf.get(s.id)?.bundle;
  return `
    <li class="skill${caution ? " caution" : ""}">
      <div class="skill-body">
      <div class="skill-head">
        <h3><a class="skill-name" href="${skillHref(s.id)}">${esc(s.name)}</a></h3>
        <span class="skill-source">${esc(repoKey(s))}${
          bundle
            ? ` · part of <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a>`
            : ""
        }</span>
      </div>
      ${s.agentReview.tldr?.glance.length ? glanceHtml(s.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(s.agentReview.description)}</p>`}
      <div class="tags">${tags.map((t) => tagChip(t, null, st.tags.includes(t))).join("")}</div>
      ${moreLink(s, more, st)}
      </div>
      ${propsHtml(s, st)}
    </li>`;
}

function bundleRow(b: Bundle, more: number, st: State): string {
  // When filtering, the skills that don't match are dimmed.
  const hits = isFiltered(st) ? skillsOf(b).filter((s) => passes(s, st)) : [];
  const members = b.agentReview.skills.map(({ id }) => {
    const dim = hits.length && !hits.some((s) => s.id === id);
    return `<a href="${skillHref(id)}"${dim ? ` class="dim"` : ""}>${esc(skillById.get(id)?.name ?? id)}</a>`;
  });
  return `
    <li class="skill bundle">
      <div class="skill-body">
      <div class="skill-head">
        <h3><a class="skill-name" href="${bundleHref(b.id)}">${esc(b.agentReview.name)}</a></h3>
        <span class="kind">Bundle · ${plural(b.agentReview.skills.length, "skill")}</span>
        <span class="skill-source">${esc(repoKey(b))}</span>
      </div>
      ${b.agentReview.tldr?.glance.length ? glanceHtml(b.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(b.agentReview.description)}</p>`}
      <p class="members">${members.join('<span aria-hidden="true"> · </span>')}</p>
      ${moreLink(b, more, st)}
      </div>
      ${propsHtml(b, st)}
    </li>`;
}

function section(title: string, question: string | null, chips: string): string {
  return `<section class="facet"><h2${question ? ` title="${esc(question)}"` : ""}>${esc(title)}</h2><div class="chips">${chips || `<span class="muted">None</span>`}</div></section>`;
}

function tagSection(st: State, facetId: string): string {
  const facet = facetById.get(facetId);
  if (!facet) return "";
  const n = counts(st, facetId, (s) => tagsOf(s).filter((t) => facetOf(t) === facetId));
  const shown = (t: string) => Boolean(n.get(t) || st.tags.includes(t));
  const chip = (t: string) =>
    filterChip(
      "data-tag",
      t,
      tagLabel(t) ?? t.slice(facetId.length + 1),
      n.get(t) ?? 0,
      st.tags.includes(t),
      tagInfo.get(t),
    );
  // A parent's values sit indented under it; a value with two parents shows under both.
  const top = facet.values.map((v) => tagOf(facet, v.id)).filter((t) => !parentsOf(t).length);
  return section(
    facet.name,
    facet.question,
    top
      .map((t) => {
        const children = includedBy(t).filter(shown);
        return `${shown(t) ? chip(t) : ""}${children.length ? `<div class="chips sub">${children.map(chip).join("")}</div>` : ""}`;
      })
      .join(""),
  );
}

export function facetsHtml(st: State, stackExpanded: boolean): string {
  const sections: string[] = [];
  for (const f of ["category", "type", "effect", "needs", "by", "flag"])
    sections.push(tagSection(st, f));
  // Topics, by group.
  const topic = facetById.get("topic");
  const topicCounts = counts(st, "topic", (s) =>
    s.agentReview.tags.filter((t) => facetOf(t) === "topic"),
  );
  const groups = (topic?.groups ?? [])
    .map((g) => {
      const chips = g.values
        .filter((v) => topicCounts.get(v) || st.tags.includes(v))
        .map((v) => filterChip("data-tag", v, v, topicCounts.get(v) ?? 0, st.tags.includes(v)))
        .join("");
      return chips ? `<h3 class="group">${esc(g.name)}</h3><div class="chips">${chips}</div>` : "";
    })
    .join("");
  sections.push(
    `<section class="facet"><h2 title="${esc(topic?.question ?? "")}">Topics</h2>${groups || `<p class="muted">None</p>`}</section>`,
  );
  // Stack, most used first.
  const stackCounts = counts(st, "stack", (s) =>
    s.agentReview.tags.filter((t) => t.startsWith("stack:")),
  );
  const stack = [
    ...stackCounts.keys(),
    ...st.tags.filter((t) => t.startsWith("stack:") && !stackCounts.has(t)),
  ].sort((a, b) => (stackCounts.get(b) ?? 0) - (stackCounts.get(a) ?? 0) || a.localeCompare(b));
  const shown = stackExpanded ? stack : stack.slice(0, 16);
  sections.push(
    section(
      "Stack",
      facetById.get("stack")?.question ?? null,
      shown
        .map((t) =>
          filterChip("data-tag", t, t.slice(6), stackCounts.get(t) ?? 0, st.tags.includes(t)),
        )
        .join("") +
        (stack.length > 16
          ? `<button type="button" class="link-button" data-action="stack">${stackExpanded ? "Show fewer" : `Show all ${stack.length}`}</button>`
          : ""),
    ),
  );
  return sections.join("");
}

function activeFilters(st: State): string {
  const chips: string[] = [];
  const remove = (kind: string, value: string, label: string) =>
    `<button type="button" class="active-chip" data-remove="${kind}" data-value="${esc(value)}" aria-label="Remove filter ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`;
  if (st.q) chips.push(remove("q", st.q, `“${st.q}”`));
  for (const t of st.tags) chips.push(remove("tag", t, t));
  if (st.repo) chips.push(remove("repo", st.repo, `from ${st.repo}`));
  for (const p of PROP_IDS)
    if (isNarrowed(p, st.ranges[p]))
      chips.push(remove("range", p, `${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`));
  return chips.length
    ? `<div class="active">${chips.join("")}<button type="button" class="link-button" data-action="clear">Clear all</button></div>`
    : "";
}

export function resultsHtml(st: State): string {
  const { list, hidden, total, bundles } = results(st);
  const all = results(fresh()).total;
  const repoNote = st.repo ? repoById.get(st.repo) : undefined;
  return `
    <div class="toolbar">
      <p id="count" role="status"><strong>${[
        total - bundles || !bundles ? plural(total - bundles, "skill") : "",
        bundles ? plural(bundles, "bundle") : "",
      ]
        .filter(Boolean)
        .join(", ")}</strong>${
        st.one && list.length !== total ? `, ${plural(list.length, "repo")}` : ""
      }${isFiltered(st) ? ` <span class="muted">of ${all}</span>` : ""}</p>
      <button type="button" class="filters-toggle" data-action="filters" aria-controls="filters">Filters</button>
    </div>
    ${activeFilters(st)}
    ${repoNote ? `<p class="repo-banner"><a href="https://github.com/${esc(repoNote.id)}">${esc(repoNote.id)}</a>${repoNote.agentReview.description ? ` · ${esc(repoNote.agentReview.description)}` : ""}</p>` : ""}
    ${
      list.length
        ? `<ol class="skill-list">${list
            .map((e) => {
              const more = hidden.get(repoKey(e)) ?? 0;
              return isBundle(e) ? bundleRow(e, more, st) : skillRow(e, more, st);
            })
            .join("")}</ol>`
        : `<p class="empty">No skill matches these filters.${
            st.q
              ? `<br />Describing a need in your own words? <button type="button" class="link-button" data-action="ask">Find skill with your agent</button>`
              : ""
          }</p>`
    }`;
}

/** A two-handled slider per property. The client updates them in place while they're dragged. */
export function rangesHtml(st: State): string {
  return PROP_IDS.map((p) => {
    const [lo, hi] = st.ranges[p];
    const last = lastStop(p);
    const handle = (end: 0 | 1, value: number) =>
      `<input type="range" min="0" max="${last}" step="1" value="${value}" data-range="${p}" data-end="${end}" aria-label="${PROPS[p].label}, ${end ? "to" : "from"}" aria-valuetext="${rangeLabel(p, [lo, hi])}" />`;
    return `<section class="facet range"><h2>${PROPS[p].label} <output data-range-label="${p}">${rangeLabel(p, [lo, hi])}</output></h2><div class="slider" data-slider="${p}" style="--lo: ${lo / last}; --hi: ${hi / last}">${handle(0, lo)}${handle(1, hi)}</div></section>`;
  }).join("");
}

/** The presets, then the sort and its order, and one entry per repo. Re-rendered with the list, since a search adds Best match. */
export function settingsHtml(st: State): string {
  const presets = (Object.keys(PRESETS) as Preset[])
    .map((id) => {
      const p = PRESETS[id];
      return `<button type="button" class="preset" data-preset="${id}" aria-pressed="${st.sort === p.sort && !st.asc && st.one === p.one}" title="${esc(p.title)}">${p.label}</button>`;
    })
    .join("");
  const options = `${
    st.q ? `<option value="match"${st.sort === "match" ? " selected" : ""}>Best match</option>` : ""
  }${PROP_IDS.map(
    (p) => `<option value="${p}"${p === st.sort ? " selected" : ""}>${PROPS[p].label}</option>`,
  ).join(
    "",
  )}<option value="growth"${st.sort === "growth" ? " selected" : ""}>${GROWTH.label}</option>`;
  const order =
    st.sort === "match"
      ? ""
      : `<button type="button" class="order" data-action="order" title="Reverse the order">${
          st.sort !== "growth" && PROPS[st.sort].date
            ? st.asc
              ? "Oldest first"
              : "Newest first"
            : st.asc
              ? "Lowest first"
              : "Highest first"
        } <span aria-hidden="true">${st.asc ? "↑" : "↓"}</span></button>`;
  return `
    <div class="presets" role="group" aria-label="Presets">${presets}</div>
    <section class="facet settings">
      <h2><label for="sort">Sort by</label></h2>
      <select id="sort">${options}</select>
      <div class="sort-row">${order}<label class="check"><input type="checkbox" id="one"${st.one ? " checked" : ""} /> One per repo</label></div>
    </section>`;
}

/**
 * The skills list's page. The left sidebar holds the site's name and links, and every setting:
 * presets, sort, sliders and tags. The right side holds what the page is for: `intro`, the two
 * ways to search, and the list.
 */
export function listView(st: State, intro = "", head = ""): string {
  return `
    <div class="skills-view">
      <aside id="filters" aria-label="Settings and filters">
        ${head}
        <div class="side-body">
          <div id="settings">${settingsHtml(st)}</div>
          <div id="ranges">${rangesHtml(st)}</div>
          <div id="facets">${facetsHtml(st, false)}</div>
        </div>
      </aside>
      <div class="list-main">
        ${intro}
        <div class="search-ctas">
          <div class="search">
            <label for="q" class="sr-only">Search skills</label>
            <input id="q" type="search" value="${esc(st.q)}" placeholder="Search names, descriptions, tags" autocomplete="off" spellcheck="false" />
          </div>
          <button type="button" class="ask-button" data-action="ask" aria-describedby="ask-label">Find skill with your agent</button>
        </div>
        <p id="ask-label" class="ask-label">Describe what you need in the search box, then copy a prompt for Claude, ChatGPT or any chat agent: your words as the need, and the skills the filters leave as the catalog.</p>
        <section id="results" aria-label="Skills">${resultsHtml(st)}</section>
      </div>
    </div>`;
}
