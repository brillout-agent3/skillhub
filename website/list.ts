/**
 * The skills list: its filters, which live in the URL query so every filtered list can be shared
 * as a link, and its HTML. The page is pre-rendered unfiltered; its client script re-renders it.
 */

import { age, compact, date, daysBefore, esc, href, percent, plural } from "./format.ts";
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
  listedOutsideBundle,
  nameOf,
  parentsOf,
  repoById,
  repoHref,
  repoKey,
  growthOf,
  GROWTH_BASE_MIN,
  GROWTH_MIN,
  GROWTH_WEEKS,
  skillById,
  skillHref,
  skillsOf,
  starsOf,
  tagChip,
  tagInfo,
  tagLabel,
  tagOf,
  tagsOf,
  publishedOf,
  weekOf,
} from "./skills.ts";
import { bundlePage, skillPage } from "./github.ts";
// The browser's copy of the data, which leaves some fields out: see client-data.ts.
import {
  searchWords,
  type ClientBundle as Bundle,
  type ClientSkill as Skill,
  type SearchWords,
} from "./client-data.ts";
import { CHECK, CHICK, DOWNLOAD, SEARCH, STAR, iconDefsHtml } from "./prop-icons.ts";
import { account, bookmarkSvg, loginHref, saveButton, saveKey, savedCount } from "./saves.ts";

/** A row of the skills list: a skill, or a bundle with its skills inside. */
type Entry = Skill | Bundle;

/** Tags the list's rows leave to the skill's page: ones that hold for most skills, and categories, which the filters already show. */
const quiet = (tag: string) => tag === "by:community" || facetOf(tag) === "category";

// ------------------------------------------------------------------- state

/**
 * Buttons that set the sort and the sliders (see presetPatch), highest first, each named after what
 * it shows, which the settings spell out: Rising, the default view, by how fast the weekly downloads
 * grow; Rising & new by weekly downloads among the skills published in the last NEW_SINCE days (a
 * skill that young has no growth yet, see growthOf; one that took off from almost nothing counts as
 * published then, see publishedOf); Top by weekly downloads; New by publishing date.
 */
export type Preset = "rising" | "rising-new" | "top" | "new";
interface PresetInfo {
  label: string;
  sort: Sort;
  /** The Age range it sets: so many days at most, or any age. */
  since: Age | null;
  title: string;
}
/** How recent Rising & new's skills are, in days. */
const NEW_SINCE = 90;
export const PRESETS: Record<Preset, PresetInfo> = {
  rising: {
    label: "Rising",
    sort: "growth",
    since: null,
    title: "Downloads growing the fastest",
  },
  "rising-new": {
    label: "Rising & new",
    sort: "week",
    since: NEW_SINCE,
    title: `The most downloaded this week of those published in the last ${NEW_SINCE} days`,
  },
  top: { label: "Top", sort: "week", since: null, title: "Most downloaded this week" },
  new: {
    label: "New",
    sort: "published",
    since: null,
    title: "Most recently published",
  },
};

/** The numbers every row shows, which the list sorts by and the sliders filter on. */
export type Prop = "published" | "stars" | "downloads" | "week";
type Value = number | string;
interface PropInfo {
  label: string;
  /** The icon that stands for it in the rows and on its filter's pill: see prop-icons.ts. */
  icon: string;
  /** The word under the icon, when it shares its icon with another number. */
  tag?: string;
  /** The entry's value, or null when unknown. Dates are YYYY-MM-DD. */
  of: (e: Entry) => Value | null;
  /** Where the value comes from, for its tooltip. Only called when the value is known. */
  title: (e: Entry) => string;
  /** The slider's stops, lowest first. The last one is above every value, so the full range includes them all. */
  stops: Value[];
  /** How the URL names each stop, when not by its value. */
  keys?: string[];
  /** Its values are dates, and its stops ages: see AGES. */
  date?: boolean;
  /** How the catalog's values spread out: see Crowd. */
  crowd?: Crowd;
  /** Where its value stands, in words, for the skill's page: see standingOf. */
  standing?: { more: string; fewer: string; most: string };
}

/**
 * How the catalog's values of a number spread out, so that a row shows whether its number is a lot:
 * a histogram next to it, with its own bar in garnet and its rank under it (see crowdHtml). A
 * value's place is 1 plus how many are higher, so equal values share a place: a bundle shares its
 * most installed skill's, every skill of a repo its repo's.
 */
interface Crowd {
  /** What it ranks, such as "skill". */
  what: string;
  /** Its rank's words at either end: "Top" and "Bottom", or for an age "Newest" and "Oldest". */
  ends: [top: string, bottom: string];
  /** Which way its places go, when it says so, such as "newest first". */
  order?: string;
  total: number;
  placeOf: (n: number) => number;
  /** How many are lower. */
  belowOf: (n: number) => number;
  /** Which bar a value is in, from 0, the lowest values', to BINS - 1. */
  binOf: (n: number) => number;
  /**
   * Each bar's height in the chart's 100 × 20 viewBox, lowest values first: as tall as the values
   * it holds against the fullest bar's; one that holds any is at least 1.2, so it doesn't pass for
   * none. The bar of a row's own value is as tall as the others: only its color sets it apart.
   */
  bars: number[];
  /** The chart's scale, for the skill's page: where each mark is, from 0 to 1, and its label. */
  ticks: [at: number, label: string][];
}
/** The histograms' bars, and the gap between two, in the chart's viewBox. */
const BINS = 24;
const BAR_GAP = 1;
const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
/**
 * `scale` "log" spreads counts by their order of magnitude, so that 10 to 100 is as wide as 10K to
 * 100K; "days" spreads dates, as days, evenly; "linear" spreads growths evenly. The chart starts at
 * the 1st percentile: a few new skills with a handful of downloads would squeeze the rest into its
 * right end. A growth's also ends at the 99th, as a few grow several times over.
 */
function crowd(
  what: string,
  values: (number | null)[],
  scale: "log" | "days" | "linear",
  { ends = ["Top", "Bottom"], order }: { ends?: [string, string]; order?: string } = {},
): Crowd {
  const known = values.filter((v) => v !== null);
  const desc = [...known].sort((a, b) => b - a);
  const f = scale === "log" ? (v: number) => Math.log10(Math.max(v, 1)) : (v: number) => v;
  const lo = f(desc[Math.floor(desc.length * 0.99)]);
  const hi = f(desc[scale === "linear" ? Math.floor(desc.length * 0.01) : 0]);
  const at = (v: number) => Math.min(1, Math.max(0, (f(v) - lo) / (hi - lo || 1)));
  const binOf = (v: number) => Math.min(BINS - 1, Math.floor(at(v) * BINS));
  const counts = Array<number>(BINS).fill(0);
  for (const v of known) counts[binOf(v)]++;
  const fullest = Math.max(...counts);
  /** How many come before the first that `past` says is past, in `desc`. */
  const countUntil = (past: (x: number) => boolean) => {
    let a = 0;
    let b = desc.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (past(desc[mid])) b = mid;
      else a = mid + 1;
    }
    return a;
  };
  const ticks: [number, string][] = [];
  if (scale === "log")
    for (let p = Math.ceil(lo); p <= Math.floor(hi); p++)
      ticks.push([at(10 ** p), compact(10 ** p)]);
  else if (scale === "days") {
    // A month's first day, some months apart: about six marks. January says its year.
    const first = new Date((lo + 1) * 86_400_000);
    const months = Math.max(1, Math.ceil((hi - lo) / 30 / 6));
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    for (; d.getTime() / 86_400_000 <= hi; d.setUTCMonth(d.getUTCMonth() + months))
      ticks.push([
        at(d.getTime() / 86_400_000),
        d.getUTCMonth() ? MONTH.format(d) : String(d.getUTCFullYear()),
      ]);
  }
  return {
    what,
    ends,
    order,
    total: desc.length,
    placeOf: (v) => countUntil((x) => x <= v) + 1,
    belowOf: (v) => desc.length - countUntil((x) => x < v),
    binOf,
    bars: counts.map((n) => (n ? Math.max(1.2, (n / fullest) * 20) : 0)),
    ticks,
  };
}
/** A date as days, for the Age chart, on which the newest is the highest. */
const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
/** The repos the catalog's skills and bundles are in, which stars rank among. */
const listedRepos = new Set([...data.skills, ...data.bundles].map(repoKey));

/** 0, 10, 20, 50, 100… up past the largest value. */
function countStops(of: (s: Skill) => number | null): number[] {
  const max = Math.max(0, ...data.skills.map(of).filter((n) => n !== null));
  const stops = [0];
  for (let p = 10; stops[stops.length - 1] <= max; p *= 10) stops.push(p, 2 * p, 5 * p);
  return stops.slice(0, stops.findIndex((n) => n > max) + 1);
}
/**
 * The Age slider's inner stops, oldest first, in days before the data's date: its range is
 * relative, such as 30 days at most, so a link keeps its meaning as the data moves on. The URL names
 * them such as 30d, in its `published` parameter: the filter was named Published, and links to it
 * still work.
 */
const AGES = [365, 90, 30, 7] as const;
type Age = (typeof AGES)[number];
/** Each stop in words, as a range says it: "≤ 90 days", "> 1 year", "1 week – 30 days". */
const AGE_WORDS: Record<Age, string> = { 365: "1 year", 90: "90 days", 30: "30 days", 7: "1 week" };

// A bundle's numbers are its most popular skill's.
const most = (e: Entry) => (isBundle(e) ? "The most of any of its skills: " : "");
export const PROPS: Record<Prop, PropInfo> = {
  // Its age, such as "3 days", counted from the day it was published, which its tooltip gives: the
  // values are those dates, so the newest is the highest, and "published" names it in the URL.
  published: {
    label: "Age",
    icon: CHICK,
    of: publishedOf,
    title: (e) => {
      const on = date(publishedOf(e) as string);
      const tookOff = publishedOf(e) !== firstSeenOf(e);
      if (isBundle(e))
        return tookOff
          ? `Published ${on}, the earliest of its skills: when skills.sh first saw one, or the week one took off after getting under ${compact(GROWTH_BASE_MIN)} installs a week`
          : `Published ${on}, when skills.sh first saw one of its skills`;
      return tookOff
        ? `Published ${on}, the week it took off on skills.sh: skills.sh first saw it ${date(firstSeenOf(e) as string)}, but it got under ${compact(GROWTH_BASE_MIN)} installs a week until then`
        : `Published ${on}, when skills.sh first saw it`;
    },
    // Below and above every date, so that the full range takes them all in.
    stops: ["", ...AGES.map((n) => daysBefore(data.asOf.installs, n)), "~"],
    keys: ["", ...AGES.map((n) => `${n}d`), "~"],
    date: true,
    crowd: crowd(
      "skill",
      data.skills.map((s) => {
        const d = publishedOf(s);
        return d ? days(d) : null;
      }),
      "days",
      { ends: ["Newest", "Oldest"], order: "newest first" },
    ),
    standing: { more: "Newer than", fewer: "Older than", most: "The newest skill" },
  },
  stars: {
    label: "Stars",
    icon: STAR,
    of: starsOf,
    title: (e) => `GitHub stars of ${repoKey(e)}, ${date(data.asOf.stars)}`,
    stops: countStops(starsOf),
    crowd: crowd(
      "repo",
      data.repos.filter((r) => listedRepos.has(r.id)).map((r) => r.stars),
      "log",
    ),
    standing: {
      more: "More stars than",
      fewer: "Fewer stars than",
      most: "The most stars of any repo",
    },
  },
  downloads: {
    label: "Total Downloads",
    icon: DOWNLOAD,
    tag: "Total",
    of: installsOf,
    title: (e) => `${most(e)}All-time installs on skills.sh, ${date(data.asOf.installs)}`,
    stops: countStops(installsOf),
    crowd: crowd("skill", data.skills.map(installsOf), "log"),
    standing: {
      more: "More downloads than",
      fewer: "Fewer downloads than",
      most: "The most downloads of any skill",
    },
  },
  week: {
    label: "Weekly Downloads",
    icon: DOWNLOAD,
    tag: "Week",
    of: weekOf,
    title: (e) => `${most(e)}Installs on skills.sh in the week to ${date(data.asOf.installs)}`,
    stops: countStops(weekOf),
    crowd: crowd("skill", data.skills.map(weekOf), "log"),
    standing: {
      more: "More weekly downloads than",
      fewer: "Fewer weekly downloads than",
      most: "The most weekly downloads of any skill",
    },
  },
};
const PROP_IDS = Object.keys(PROPS) as Prop[];
const lastStop = (p: Prop) => PROPS[p].stops.length - 1;

/** A slider's range, as indexes into its stops: `lo` included, `hi` excluded. */
export type Range = [lo: number, hi: number];
export const fullRange = (p: Prop): Range => [0, lastStop(p)];
export const fullRanges = () =>
  Object.fromEntries(PROP_IDS.map((p) => [p, fullRange(p)])) as Record<Prop, Range>;
export const isNarrowed = (p: Prop, [lo, hi]: Range) => lo > 0 || hi < lastStop(p);

/** How the URL names a slider's stop. */
const stopKey = (p: Prop, i: number) => PROPS[p].keys?.[i] ?? String(PROPS[p].stops[i]);

/**
 * A slider's range in words, such as "≥ 1K" or "1K – 5K"; and for an age, said as the counts are,
 * "≤ 30 days" or "30 days – 1 year": in words, "Under 90 days" was too long for the settings' line
 * on a 1,280px screen (see .settings-line in style.css).
 */
export function rangeLabel(p: Prop, [lo, hi]: Range): string {
  const { stops, date } = PROPS[p];
  if (date) {
    // A date at or after `lo`'s is that age at most; one before `hi`'s is over it.
    const atMost = lo > 0 ? AGE_WORDS[AGES[lo - 1]] : null;
    const over = hi < lastStop(p) ? AGE_WORDS[AGES[hi - 1]] : null;
    return atMost && over
      ? `${over} – ${atMost}`
      : atMost
        ? `≤ ${atMost}`
        : over
          ? `> ${over}`
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
  icon: DOWNLOAD,
  tag: "Growth",
  /** Among the skills that have a growth: see growthOf. */
  crowd: crowd("skill", data.skills.map(growthOf), "linear"),
  // No full stop at its end, as the numbers' titles: propsHtml adds one before the place.
  title: (e: Entry) =>
    `${isBundle(e) ? "The most of any of its skills: " : ""}Installs on skills.sh in an average week of the 2 to ${date(data.asOf.installs)}, against an average week of the 4 before. Only for skills with at least ${compact(GROWTH_MIN)} a week, and at least ${compact(GROWTH_BASE_MIN)} in each of the last ${GROWTH_WEEKS} weeks: a younger skill, or one that took off from almost nothing, shows under ${PRESETS["rising-new"].label}`,
};
/** A search sorts by best match unless another sort is picked; otherwise the list is Rising, by growth. */
export const defaultSort = (q: string): Sort => (q.trim() ? "match" : "growth");
/**
 * The search as it's looked for: what the box holds, without the spaces around it. A box that only
 * holds spaces isn't a search: it neither narrows the list nor sorts it by best match.
 */
const term = (st: State) => st.q.trim();
/** The Age range for `since` days at most, or any age. */
export const sinceRange = (since: Age | null): Range =>
  since
    ? [PROPS.published.keys?.indexOf(`${since}d`) ?? 0, lastStop("published")]
    : fullRange("published");
const sameRange = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];
/**
 * What a preset sets: its sort, highest first, and its Age range, every other slider back at
 * its full range, since one left narrowed (say Weekly Downloads from 5,000) would make the list
 * something other than what the preset is named after. The search, tags and Show stay as they are.
 */
export function presetPatch(id: Preset) {
  const { sort, since } = PRESETS[id];
  return {
    sort,
    asc: false,
    ranges: { ...fullRanges(), published: sinceRange(since) },
  } satisfies Partial<State>;
}
export interface State {
  q: string;
  tags: string[];
  repo: string | null;
  sort: Sort;
  /** Lowest (or oldest) first, instead of highest first. */
  asc: boolean;
  ranges: Record<Prop, Range>;
  show: Show;
  /** Only what the logged-in person saved: the header's Saved link. */
  saved: boolean;
}

/**
 * What the list shows: bundles and the skills listedOutsideBundle ("all"), every skill, those only
 * listed inside their bundle included ("skills"), or only bundles. Not a preset's business.
 */
export type Show = "all" | "skills" | "bundles";
/**
 * Each with its button's word, and what it means in full where the word alone doesn't say: "Both"
 * rather than "Skills & bundles", whose length sent Show onto a second line of settings on a
 * 1,280px screen (see .settings-line in style.css).
 */
export const SHOWS: [show: Show, label: string, full?: string][] = [
  ["all", "Both", "Skills and bundles"],
  ["skills", "Skills"],
  ["bundles", "Bundles"],
];

/** The repos' ids by their lowercase: GitHub ignores case, and so do this site's pages (see github.ts). */
const repoIdByLower = new Map(data.repos.map((r) => [r.id.toLowerCase(), r.id]));

export function parse(search: string): State {
  const p = new URLSearchParams(search);
  const sort = p.get("sort") as Sort | null;
  const q = p.get("q") ?? "";
  // A repo as the data spells it, however the link does: ?repo=Anthropics/Skills is anthropics/skills.
  const repo = p.get("repo");
  const ranges = fullRanges();
  for (const prop of PROP_IDS) {
    // Such as stars=1000..50000, published=30d.. with no upper bound, or published=.. for any.
    const param = p.get(prop);
    if (param === null) continue;
    ranges[prop] = fullRange(prop);
    const [lo, hi] = param.split("..");
    const keys = PROPS[prop].stops.map((_, i) => stopKey(prop, i));
    // A range keeps at least one step, as the slider's handles do: a lower bound at the last
    // stop, which is above every value, isn't one. Its handles would sit on one another.
    if (lo && keys.includes(lo) && keys.indexOf(lo) < lastStop(prop))
      ranges[prop][0] = keys.indexOf(lo);
    if (hi && keys.includes(hi) && keys.indexOf(hi) > ranges[prop][0])
      ranges[prop][1] = keys.indexOf(hi);
  }
  return {
    q,
    // Each tag once, and none without a name: ?tag= would be a filter's chip that says nothing.
    tags: [...new Set(p.getAll("tag").filter(Boolean))],
    repo: repo && (repoIdByLower.get(repo.toLowerCase()) ?? repo),
    // A sort the list has, by its own name: `in` would also take what every object inherits, such
    // as ?sort=constructor, which has no number to sort by, and the list's script would throw.
    sort:
      sort && (Object.hasOwn(PROPS, sort) || sort === "growth" || (sort === "match" && q.trim()))
        ? sort
        : defaultSort(q),
    asc: p.get("order") === "asc",
    ranges,
    show: (["skills", "bundles"] as const).find((v) => v === p.get("show")) ?? "all",
    saved: p.has("saved"),
  };
}
/** The query string for a state, empty for the default view. */
export function query(s: State): string {
  const p = new URLSearchParams();
  if (s.saved) p.set("saved", "");
  // As it's looked for: the box may hold a space after it, while the next word is typed.
  if (term(s)) p.set("q", term(s));
  for (const t of s.tags) p.append("tag", t);
  if (s.repo) p.set("repo", s.repo);
  if (s.sort !== defaultSort(s.q)) p.set("sort", s.sort);
  if (s.asc) p.set("order", "asc");
  for (const prop of PROP_IDS) {
    const [lo, hi] = s.ranges[prop];
    if (isNarrowed(prop, [lo, hi]))
      p.set(
        prop,
        `${lo > 0 ? stopKey(prop, lo) : ""}..${hi < lastStop(prop) ? stopKey(prop, hi) : ""}`,
      );
  }
  if (s.show !== "all") p.set("show", s.show);
  // ?saved rather than ?saved=
  const q = p.toString().replace(/^saved=(&|$)/, "saved$1");
  return q ? `?${q}` : "";
}
/** The default view: Rising. */
export const fresh = (): State => parse("");
/**
 * `prev` with `patch` applied. The sort, while at its default, follows the default for the new
 * search: best match while there is one.
 */
export function patched(prev: State, patch: Partial<State>): State {
  const next = { ...prev, ...patch };
  if (!("sort" in patch) && prev.sort === defaultSort(prev.q)) next.sort = defaultSort(next.q);
  if (next.sort === "match" && !term(next)) next.sort = defaultSort("");
  return next;
}
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

/**
 * The words of the TLDRs' prose, which only the search reads. The server has the prose in the
 * data. The client's copy leaves it out: list-client.ts loads the words after the page and hands
 * them to addSearchWords, and until then the search goes without them. See client-data.ts.
 */
let prose = searchWords(data);

/** What the search looks in, and with what weight it ranks: see `index`. */
let searchText = new Map<string, string>();
let bundleText = new Map<string, string>();
let skillFields = new Map<string, Fields>();
let bundleFields = new Map<string, Fields>();

/** Adds the TLDRs' words to what the search looks in. */
export function addSearchWords(words: SearchWords) {
  prose = words;
  index();
  last = undefined;
}

/**
 * A text as the search compares it: in lowercase and without accents, so that "résumé" finds
 * "resume", and the other way around. Both what's searched for and what's looked in.
 */
const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
/**
 * What's searched for, plain, and without its double quotes, straight or curly: a search in quotes,
 * as one for an exact phrase elsewhere, looked for the quotes themselves, and found nothing.
 */
const sought = (q: string) =>
  plain(q)
    .replace(/["“”]/g, " ")
    .trim();
/**
 * A search, read once for the many times every skill is asked about it: its words, plurals cut
 * back so they match the singular too ("resumes" finds "resume", "strategies" finds "strategy"),
 * each with what tells whether it starts a word of a text; and the whole of it, for `score`.
 */
interface Sought {
  q: string;
  words: { w: string; start: RegExp }[];
  phrase: string;
}
let lastSought: Sought | undefined;
function read(q: string): Sought {
  if (lastSought?.q === q) return lastSought;
  const phrase = sought(q);
  const singular = (w: string) =>
    w.length < 4 ? w : w.endsWith("ies") ? w.slice(0, -3) : /[^s]s$/.test(w) ? w.slice(0, -1) : w;
  const words = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .map((w) => ({
      w,
      start: new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"),
    }));
  return (lastSought = { q, words, phrase });
}
const words = (q: string) => read(q).words;
const matches = (text: string, q: string) => words(q).every(({ w }) => text.includes(w));

/**
 * For sorting a search by best match: each word of it scores where it appears, a name the most,
 * then the description, the TLDR's glance and the tags, the repo, and last the TLDR's text and the
 * note. A name holding the whole search scores extra.
 */
type Fields = [text: string, weight: number][];
const fields = (parts: [string | null | undefined, number][]): Fields =>
  parts.filter((p): p is [string, number] => Boolean(p[0])).map(([t, w]) => [plain(t), w]);
function index() {
  searchText = new Map(
    data.skills.map((s) => [
      s.id,
      [
        s.name,
        s.agentReview.description,
        ...(s.agentReview.tldr?.glance.map((g) => g.text) ?? []),
        prose.skills[s.id],
        repoKey(s),
        s.agentReview.note,
        ...tagsOf(s),
        ...tagsOf(s).map(tagLabel),
      ]
        .filter(Boolean)
        .map((text) => plain(text as string))
        .join(" "),
    ]),
  );
  bundleText = new Map(
    data.bundles.map((b) => [
      b.id,
      [
        b.agentReview.name,
        b.agentReview.description,
        ...(b.agentReview.tldr?.glance.map((g) => g.text) ?? []),
        prose.bundles[b.id],
      ]
        .filter(Boolean)
        .map((text) => plain(text as string))
        .join(" "),
    ]),
  );
  skillFields = new Map(
    data.skills.map((s) => [
      s.id,
      fields([
        [s.name, 8],
        [s.agentReview.description, 4],
        [s.agentReview.tldr?.glance.map((g) => g.text).join(" "), 3],
        [[...tagsOf(s), ...tagsOf(s).map(tagLabel)].filter(Boolean).join(" "), 3],
        [repoKey(s), 2],
        [prose.skills[s.id], 1],
        [s.agentReview.note, 1],
      ]),
    ]),
  );
  bundleFields = new Map(
    data.bundles.map((b) => [
      b.id,
      fields([
        [b.agentReview.name, 8],
        [b.agentReview.description, 4],
        [b.agentReview.tldr?.glance.map((g) => g.text).join(" "), 3],
        [repoKey(b), 2],
        [prose.bundles[b.id], 1],
      ]),
    ]),
  );
}
index();

/** A word counts in full where it starts a word, and a quarter inside one, such as "cad" in "academic". */
function score(f: Fields, q: string): number {
  const name = f[0]?.[1] === 8 ? f[0][0] : "";
  const { words, phrase } = read(q);
  return (
    words.reduce(
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
  if (st.saved && !account.saved.has(saveKey("skill", s.id))) return false;
  if (!inRanges(rangedBy(s, st), st)) return false;
  const selected = new Map<string, string[]>();
  for (const t of st.tags) selected.set(facetOf(t), [...(selected.get(facetOf(t)) ?? []), t]);
  for (const [facet, tags] of selected)
    if (facet !== skip && !tags.some((t) => tagsOf(s).includes(t))) return false;
  return !term(st) || matches(searchText.get(s.id) ?? "", st.q);
}

/**
 * Whether the entry's numbers are within the sliders' ranges. A bundle's are its own, the ones its
 * row shows (its oldest skill's date, its most downloaded skill's downloads), so that a bundle
 * whose oldest skill is a year old isn't in "Age: ≤ 90 days" for its newest skills.
 */
const inRanges = (e: Entry, st: State) => PROP_IDS.every((p) => inRange(e, p, st.ranges[p]));
function inRange(e: Entry, p: Prop, [lo, hi]: Range): boolean {
  if (!isNarrowed(p, [lo, hi])) return true;
  const v = PROPS[p].of(e);
  return v !== null && v >= PROPS[p].stops[lo] && v < PROPS[p].stops[hi];
}

/**
 * The entry whose numbers the sliders filter a skill by: a skill listed only inside its bundle is
 * in the sliders' ranges when its bundle is, unless the list shows it on its own.
 */
const rangedBy = (s: Skill, st: State): Entry =>
  (!listsAlone(s, st) && bundleOf.get(s.id)?.bundle) || s;

/**
 * Whether the list shows the skill on its own row. With bundles, a skill that isn't
 * listedOutsideBundle is only listed in its bundle's row; but what you saved is listed, whatever
 * it is.
 */
const listsAlone = (s: Skill, st: State) =>
  st.show === "skills" || st.saved || listedOutsideBundle(s);

/**
 * The filters about a bundle's skills: tags and the search. The sliders' ranges, and whether it's
 * saved, are about the bundle itself.
 */
const skillFilters = (st: State): State => ({ ...st, ranges: fullRanges(), saved: false });
/** Whether the bundle is saved, when the list shows only what's saved. */
const savedBundle = (b: Bundle, st: State) =>
  !st.saved || account.saved.has(saveKey("bundle", b.id));

/**
 * The skills through which a bundle matches the tags and search: those that match them, or, when
 * the search matches the bundle itself, those that match the tags.
 */
function matchedThrough(b: Bundle, st: State): Skill[] {
  const hits = skillsOf(b).filter((s) => passes(s, skillFilters(st)));
  return hits.length ? hits : matchedByItself(b, st);
}

/**
 * The skills a bundle matches through when the search matches only the bundle itself, its name or
 * its words, and none of its skills: those that match the tags. None when a skill of it matches the
 * search, or when the bundle doesn't.
 */
function matchedByItself(b: Bundle, st: State): Skill[] {
  if (!term(st) || !matches(bundleText.get(b.id) ?? "", st.q)) return [];
  const rest = skillFilters(st);
  const skills = skillsOf(b);
  if (skills.some((s) => passes(s, rest))) return [];
  return skills.filter((s) => passes(s, { ...rest, q: "" }));
}

/**
 * The skills the list shows as matching, on a row of their own or in their bundle's: those that
 * pass the filters and the search, and those of a bundle that a search only finds by the bundle's
 * own name or words, which its row then shows as matching too. The list's count and the sliders'
 * histograms count these, and the tags' counts go by them (see counts), so that a search for a
 * bundle's name doesn't show its row under "0 skills" and no tags. Not with Saved on, where a saved
 * bundle counts as a bundle, not as its skills (see savedBundlesHtml), nor when the list shows no
 * bundle.
 */
function shownSkills(st: State): Skill[] {
  const shown = data.skills.filter((s) => passes(s, st));
  if (!term(st) || st.saved || st.show === "skills") return shown;
  const seen = new Set(shown);
  for (const b of data.bundles)
    if (inRanges(b, st))
      for (const s of matchedByItself(b, st))
        if (!seen.has(s)) {
          seen.add(s);
          shown.push(s);
        }
  return shown;
}

/** A bundle is in its sliders' ranges by its own numbers, and matches the tags and search through any of its skills. */
const bundlePasses = (b: Bundle, st: State) =>
  savedBundle(b, st) && inRanges(b, st) && matchedThrough(b, st).length > 0;

const isFiltered = (st: State) =>
  Boolean(term(st) || st.tags.length || st.repo) ||
  PROP_IDS.some((p) => isNarrowed(p, st.ranges[p]));

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

interface Results {
  list: Entry[];
  total: number;
  bundles: number;
}

/** The client renders a state's rows in several steps, all from the same results. */
let last: { st: State; r: Results } | undefined;
function results(st: State): Results {
  if (last?.st !== st) last = { st, r: compute(st) };
  return last.r;
}

/** The filtered, sorted list. With bundles, a skill that isn't listedOutsideBundle is only listed in its bundle's row. */
function compute(st: State): Results {
  const matching = [
    ...(st.show === "skills" ? [] : data.bundles.filter((b) => bundlePasses(b, st))),
    ...(st.show === "bundles" ? [] : data.skills.filter((s) => listsAlone(s, st) && passes(s, st))),
  ].sort(order(st.sort, st.asc, st.q));
  return { list: matching, total: matching.length, bundles: matching.filter(isBundle).length };
}

/**
 * How many skills, or bundles when the list shows only those, have each value of a facet, with the
 * other filters: as many as the list counts once the value is the facet's selected tag.
 *
 * A bundle that the search finds by its own name or words takes some care, as which of its skills
 * it matches through depends on the tag (see matchedThrough): the ones that match the search and
 * have the tag, or else every one that has the tag. So a value also counts the skills that have
 * it and don't match the search, unless one that matches the search has it too. Counting only what
 * the search finds without the tag, a chip said 49 and the list it led to 53.
 */
function counts(st: State, facet: string, valuesOf: (s: Skill) => string[]): Map<string, number> {
  const n = new Map<string, number>();
  const add = (values: string[]) => {
    for (const v of new Set(values)) n.set(v, (n.get(v) ?? 0) + 1);
  };
  const rest = skillFilters(st);
  const unsearched = { ...rest, q: "" };
  const itself = (b: Bundle) => Boolean(term(st)) && matches(bundleText.get(b.id) ?? "", st.q);
  if (st.show === "bundles") {
    // A bundle has a value through any skill the search finds, or through any skill at all when
    // the search finds the bundle itself.
    for (const b of data.bundles)
      if (savedBundle(b, st) && inRanges(b, st)) {
        const through = itself(b) ? unsearched : rest;
        add(
          skillsOf(b)
            .filter((s) => passes(s, through, facet))
            .flatMap(valuesOf),
        );
      }
    return n;
  }
  for (const s of data.skills) if (passes(s, st, facet)) add(valuesOf(s));
  // As in shownSkills: only a search brings in a bundle's skills through the bundle itself.
  if (!term(st) || st.saved || st.show === "skills") return n;
  for (const b of data.bundles) {
    if (!inRanges(b, st) || !itself(b)) continue;
    const skills = skillsOf(b);
    const found = skills.filter((s) => passes(s, rest, facet));
    const foundValues = new Set(found.flatMap(valuesOf));
    for (const s of skills)
      if (!found.includes(s) && passes(s, unsearched, facet))
        add(valuesOf(s).filter((v) => !foundValues.has(v)));
  }
  return n;
}

/**
 * Each slider's histogram: how many skills, or bundles when the list shows only those, have a
 * value between each two neighboring stops, one bar per step of the slider. A slider counts with
 * the other filters, as a facet's chips do, but not with its own range, so that its bars outside
 * the range show what widening it would bring back. For one state at a time.
 */
type Histograms = Record<Prop, number[]>;
let lastHistograms: { st: State; h: Histograms } | undefined;
function histograms(st: State): Histograms {
  if (lastHistograms?.st === st) return lastHistograms.h;
  const h = Object.fromEntries(
    PROP_IDS.map((p) => [p, Array<number>(lastStop(p)).fill(0)]),
  ) as Histograms;
  const add = (e: Entry) => {
    // An entry that only one range leaves out counts in that slider's histogram only.
    const out = PROP_IDS.filter((p) => !inRange(e, p, st.ranges[p]));
    for (const p of out.length === 0 ? PROP_IDS : out.length === 1 ? out : []) {
      const v = PROPS[p].of(e);
      // The stops end above every value, so every known value has its bar.
      const bar = v === null ? -1 : PROPS[p].stops.findIndex((stop) => v < stop) - 1;
      if (bar >= 0) h[p][bar]++;
    }
  };
  const unranged = { ...st, ranges: fullRanges() };
  if (st.show === "bundles") {
    for (const b of data.bundles) if (bundlePasses(b, unranged)) add(b);
  } else for (const s of shownSkills(unranged)) add(rangedBy(s, st));
  lastHistograms = { st, h };
  return h;
}

// ------------------------------------------------------------------- asking an agent

/** The active filters in words, the search included. */
function filtersText(st: State): string[] {
  const parts = st.tags.map((t) => `tag ${t}`);
  if (term(st)) parts.unshift(`the search "${term(st)}"`);
  if (st.saved) parts.unshift("the ones I saved");
  if (st.repo) parts.push(`from ${st.repo}`);
  for (const p of PROP_IDS)
    if (isNarrowed(p, st.ranges[p]))
      parts.push(`${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`);
  return parts;
}

/**
 * The state whose list the agent's prompt holds: the list below, unless its search finds nothing.
 * A search that finds nothing is most likely a need in the person's own words, which is what the
 * agent is for, so the prompt then holds what the filters leave, rather than nothing. For one state
 * at a time.
 */
let lastAsk: { st: State; of: State } | undefined;
function askState(st: State): State {
  if (lastAsk?.st !== st)
    lastAsk = { st, of: term(st) && !results(st).list.length ? { ...st, q: "" } : st };
  return lastAsk.of;
}

/**
 * A prompt to paste into any chat agent, for a need in your own words, which the search can't
 * match: the catalog is the list below, every entry the filters and the search leave (see
 * askState); "" for a need that comes in the next message. `base` is the site's absolute URL, which
 * the entries' paths are relative to.
 */
export function askPrompt(shown: State, need: string, base: string): string {
  const st = askState(shown);
  const { list } = results(st);
  const entry = (e: Entry) => {
    const review = e.agentReview;
    const numbers = [
      installsOf(e) !== null ? `${compact(installsOf(e) as number)} installs` : "",
      starsOf(e) !== null ? `${compact(starsOf(e) as number)} stars` : "",
    ].filter(Boolean);
    const head = isBundle(e)
      ? `### ${nameOf(e)} (${idPath(bundlePage(e))}/): a bundle of ${skillsOf(e)
          .map((s) => s.name)
          .join(", ")}`
      : `### ${e.name} (${idPath(skillPage(e))}/)`;
    const tags = isBundle(e) ? [] : e.agentReview.tags.filter((t) => !quiet(t));
    // As in its row: its description stands in for a glance it doesn't have.
    const facts = review.tldr?.glance.length
      ? review.tldr.glance.map((g) => `- ${g.label}: ${g.text}`)
      : [`- ${review.description}`];
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

${need.trim() || "I'll tell you in my next message."}`;
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

/**
 * The row's numbers, on its left: each as its icon, the number, and a histogram of the catalog's
 * values with its own bar and rank (see crowdHtml). The one the list is sorted by is on grey.
 */
function propsHtml(e: Entry, st: State): string {
  const row = (
    on: boolean,
    info: { icon: string; tag?: string },
    label: string,
    title: string | null,
    shown: string,
    chart: string,
  ) =>
    `<div${on ? ` class="on"` : ""}${title === null ? "" : ` title="${esc(`${label}: ${title}`)}"`}><dt>${info.icon}${info.tag ? `<span class="prop-tag" aria-hidden="true">${info.tag}</span>` : ""}<span class="sr-only">${label}</span></dt><dd class="prop-value">${shown}</dd>${chart}</div>`;
  const rows = PROP_IDS.map((p) => {
    const info = PROPS[p];
    const v = info.of(e);
    // Ages count up to the data's date, as the Age slider does, not to the viewer's day.
    const shown =
      v === null ? "—" : info.date ? age(v as string, data.asOf.installs) : compact(v as number);
    let title = v === null ? null : info.title(e);
    let chart = "";
    if (info.crowd && v !== null) {
      const n = info.date ? days(v as string) : (v as number);
      title += `. ${placeText(info.crowd, n)}`;
      chart = crowdHtml(p, info.crowd, n, "dd", true);
    }
    return row(p === st.sort, info, info.label, title, shown, chart);
  });
  // The growth shows only while the list is sorted by it, to explain the order.
  if (st.sort === "growth") {
    const g = growthOf(e);
    const title = `${GROWTH.title(e)}${g === null ? "" : `. ${placeText(GROWTH.crowd, g)}`}`;
    const chart = g === null ? "" : crowdHtml("growth", GROWTH.crowd, g, "dd", true);
    rows.push(row(true, GROWTH, GROWTH.label, title, g === null ? "—" : percent(g), chart));
  }
  return `<dl class="props">${rows.join("")}</dl>`;
}

/** Where a bar is in the chart's viewBox: its left edge and its width. */
const barX = (i: number) => (i * 100) / BINS + BAR_GAP / 2;
const BAR_WIDTH = 100 / BINS - BAR_GAP;

/**
 * A histogram of the catalog's values, lowest on the left: its bars are drawn once per page, as
 * crowdDefsHtml; the row draws its own value's bar over them in garnet, as tall as it is. With
 * `rank`, its rank in words under it, such as "Top #34" or "Oldest 23%", which slides with its bar:
 * under the first bar it starts where the chart starts, under the last it ends where it ends.
 */
function crowdHtml(id: string, c: Crowd, n: number, tag: "dd" | "div", rank: boolean): string {
  const bin = c.binOf(n);
  const h = c.bars[bin];
  const bar = h
    ? `<rect class="me" x="${barX(bin).toFixed(2)}" y="${(20 - h).toFixed(2)}" width="${BAR_WIDTH.toFixed(2)}" height="${h.toFixed(2)}" />`
    : "";
  return `<${tag} class="crowd" style="--at: ${(bin / (BINS - 1)).toFixed(3)}"><svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><use href="#crowd-${id}" />${bar}</svg>${
    rank ? `<span class="rank">${rankText(c, n)}</span>` : ""
  }</${tag}>`;
}

/**
 * Its rank, at a glance: up to #99, its place, such as "Top #34"; further down, the share of the
 * field at or above it, such as "Top 12%", or, past the middle, at or below it, such as
 * "Bottom 8%". For an age, "Newest" and "Oldest".
 */
function rankText(c: Crowd, n: number): string {
  const place = c.placeOf(n);
  const [top, bottom] = c.ends;
  if (place < 100) return `${top} #${place}`;
  return place <= c.total / 2
    ? `${top} ${Math.ceil((place / c.total) * 100)}%`
    : `${bottom} ${Math.ceil(((c.total - place + 1) / c.total) * 100)}%`;
}

/** Such as "#34 of 1,190 skills", or "#586 of 1,190 skills, newest first". */
const placeText = (c: Crowd, n: number) =>
  `#${c.placeOf(n).toLocaleString("en")} of ${plural(c.total, c.what)}${c.order ? `, ${c.order}` : ""}`;

/**
 * Where an entry's number stands among the catalog's, for the skill's page: its place, in words,
 * such as "More weekly downloads than 97% of skills", and the histogram the rows show (see
 * crowdHtml) with its scale under it. Null when the number is unknown, or doesn't rank. The page
 * adds crowdDefsHtml.
 */
export function standingOf(
  p: Prop,
  e: Entry,
): { place: string; words: string; chart: string } | null {
  const { of, date: isDate, crowd: c, standing: say } = PROPS[p];
  const v = of(e);
  if (!c || !say || v === null) return null;
  const n = isDate ? days(v as string) : (v as number);
  const place = c.placeOf(n);
  const below = c.belowOf(n);
  // Past the middle, the share it beats; before it, the share that beats it.
  const share = (k: number) => `<em>${Math.floor((k / c.total) * 100)}%</em> of ${c.what}s`;
  const words =
    place === 1
      ? say.most
      : below >= c.total / 2
        ? `${say.more} ${share(below)}`
        : `${say.fewer} ${share(place - 1)}`;
  const axis = c.ticks
    .map(([at, label]) => `<span style="--at: ${at.toFixed(3)}"><span>${label}</span></span>`)
    .join("");
  return {
    place: placeText(c, n),
    words,
    chart: `${crowdHtml(p, c, n, "div", false)}<div class="crowd-axis" aria-hidden="true">${axis}</div>`,
  };
}

/**
 * The histograms' grey bars, which the rows' charts draw (see crowdHtml), and the icons (see
 * prop-icons.ts), once per page that lists rows or tiles. The bars take their color from the
 * chart's CSS.
 */
export function crowdDefsHtml(): string {
  const charts: [string, Crowd | undefined][] = [
    ...PROP_IDS.map((p): [string, Crowd | undefined] => [p, PROPS[p].crowd]),
    ["growth", GROWTH.crowd],
  ];
  const groups = charts.map(([id, c]) => {
    if (!c) return "";
    const bars = c.bars
      .map((h, i) =>
        h
          ? `<rect x="${barX(i).toFixed(2)}" y="${(20 - h).toFixed(2)}" width="${BAR_WIDTH.toFixed(2)}" height="${h.toFixed(2)}" />`
          : "",
      )
      .join("");
    return `<g id="crowd-${id}">${bars}</g>`;
  });
  return `<svg class="crowd-defs" aria-hidden="true"><defs>${groups.join("")}${iconDefsHtml()}</defs></svg>`;
}

/** A row's repo, as a link to its page. */
const sourceHtml = (e: Entry) =>
  `<span class="skill-source"><a class="repo-link" href="${repoHref(repoKey(e))}">${esc(repoKey(e))}</a></span>`;

/**
 * A skill's row. `outside` is for a row outside the skills list, on a page about its repo: its tags
 * link to the list, filtered by them, rather than toggling its filters, and it doesn't repeat the repo.
 */
function skillRow(s: Skill, st: State, outside = false): string {
  const tags = s.agentReview.tags
    .filter((t) => !quiet(t))
    .sort((a, b) => FACET_ORDER.indexOf(facetOf(a)) - FACET_ORDER.indexOf(facetOf(b)));
  const caution = s.agentReview.tags.some((t) => CAUTION.includes(t));
  const place = bundleOf.get(s.id);
  return `
    <li class="skill${caution ? " caution" : ""}">
      <div class="skill-body">
      <div class="row-head">
      <div class="skill-head">
        <h3><a class="skill-name" href="${skillHref(s.id)}">${esc(s.name)}</a></h3>
        ${outside ? "" : sourceHtml(s)}${
          place
            ? `<span class="skill-source">${place.standalone ? "Part of" : "Only works as part of"} <a href="${bundleHref(place.bundle.id)}">${esc(place.bundle.agentReview.name)}</a></span>`
            : ""
        }
      </div>
      ${saveButton(saveKey("skill", s.id), s.name)}
      </div>
      ${s.agentReview.tldr?.glance.length ? glanceHtml(s.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(s.agentReview.description)}</p>`}
      <div class="tags">${tags.map((t) => tagChip(t, outside ? skillsLink({ tags: [t] }) : null, st.tags.includes(t))).join("")}</div>
      </div>
      ${propsHtml(s, st)}
    </li>`;
}

/** A bundle's row; `outside` as for skillRow(). */
function bundleRow(b: Bundle, st: State, outside = false): string {
  // When filtering, the skills the bundle doesn't match through are dimmed. The ranges are about the
  // bundle, so only the tags and search dim its skills.
  const hits = isFiltered(st) ? matchedThrough(b, st) : [];
  const members = b.agentReview.skills.map(({ id }) => {
    const dim = hits.length && !hits.some((s) => s.id === id);
    return `<a href="${skillHref(id)}"${dim ? ` class="dim"` : ""}>${esc(skillById.get(id)?.name ?? id)}</a>`;
  });
  return `
    <li class="skill bundle">
      <div class="skill-body">
      <div class="row-head">
      <div class="skill-head">
        <h3><a class="skill-name" href="${bundleHref(b.id)}">${esc(b.agentReview.name)}</a></h3>
        <span class="kind">Bundle of ${plural(b.agentReview.skills.length, "skill")}</span>
        ${outside ? "" : sourceHtml(b)}
      </div>
      ${saveButton(saveKey("bundle", b.id), b.agentReview.name)}
      </div>
      ${b.agentReview.tldr?.glance.length ? glanceHtml(b.agentReview.tldr.glance, 2) : `<p class="skill-desc">${esc(b.agentReview.description)}</p>`}
      <p class="members">${members.join(", ")}</p>
      </div>
      ${propsHtml(b, st)}
    </li>`;
}

function section(title: string, question: string | null, chips: string): string {
  return `<section class="facet"><h2${question ? ` title="${esc(question)}"` : ""}>${esc(title)}</h2><div class="chips">${chips || `<span class="muted">None</span>`}</div></section>`;
}

/** A facet's tags, with their counts for the other filters. Adds the tags it lists to `listed`. */
function tagSection(st: State, facetId: string, listed: Set<string>): string {
  const facet = facetById.get(facetId);
  if (!facet) return "";
  const n = counts(st, facetId, (s) => tagsOf(s).filter((t) => facetOf(t) === facetId));
  const label = (t: string) => tagLabel(t) ?? t.slice(facetId.length + 1);
  const shown = (t: string) => Boolean(n.get(t) || st.tags.includes(t));
  const chip = (t: string) => {
    listed.add(t);
    return filterChip("data-tag", t, label(t), n.get(t) ?? 0, st.tags.includes(t), tagInfo.get(t));
  };
  // A parent's values sit indented under it; a value with two parents shows under both.
  const top = (facet.values ?? [])
    .map((v) => tagOf(facet, v.id))
    .filter((t) => !parentsOf(t).length);
  const chips = top
    .map((t) => {
      const children = includedBy(t).filter(shown);
      return `${shown(t) ? chip(t) : ""}${children.length ? `<div class="chips sub">${children.map(chip).join("")}</div>` : ""}`;
    })
    .join("");
  return section(facet.name, facet.question, chips);
}

/**
 * The tag facets, under how many tags they list: every tag the skills the other filters leave have,
 * and the selected ones, each once (a value under two parents shows under both), the stack's that
 * "Show all" hides included. On narrow screens the count is a button that shows and hides the
 * facets, which are hidden at first: see list-client.ts.
 */
export function facetsHtml(st: State, stackExpanded: boolean): string {
  const sections: string[] = [];
  const listed = new Set<string>();
  for (const f of ["category", "type", "effect", "needs", "by", "flag"])
    sections.push(tagSection(st, f, listed));
  // Topics, by group.
  const topic = facetById.get("topic");
  const topicCounts = counts(st, "topic", (s) =>
    s.agentReview.tags.filter((t) => facetOf(t) === "topic"),
  );
  const groups = (topic?.groups ?? [])
    .map((g) => {
      const values = g.values.filter((v) => topicCounts.get(v) || st.tags.includes(v));
      for (const v of values) listed.add(v);
      const chips = values
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
  for (const t of stack) listed.add(t);
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
  const count = plural(listed.size, "tag");
  return `<h2 class="list-count"><span class="tags-count">${count}</span><button type="button" class="tags-toggle" data-action="tags" aria-expanded="false" aria-controls="tag-facets">${count}${CHEVRON}</button></h2><div id="tag-facets" class="tag-facets">${sections.join("")}</div>`;
}

/** Whether filters narrow the list: the search and the agent prompt then look through what they leave. */
const filtersOn = (st: State) =>
  Boolean(st.saved || st.tags.length || st.repo) ||
  PROP_IDS.some((p) => isNarrowed(p, st.ranges[p]));

/**
 * The list and the search's scope are counted in skills, those listed only inside a bundle
 * included, since the search looks through them too; or in bundles, when the list shows only
 * those. Counting the list's rows instead would make it look smaller than SkillHub.
 */
const unitOf = (st: State) => (st.show === "bundles" ? "bundle" : "skill");

/** How many skills (or bundles) a state leaves, its search included: for one state at a time. */
let lastShown: { st: State; n: number } | undefined;
const shownOf = (st: State) => {
  if (lastShown?.st !== st)
    lastShown = {
      st,
      n:
        st.show === "bundles"
          ? data.bundles.filter((b) => bundlePasses(b, st)).length
          : shownSkills(st).length,
    };
  return lastShown.n;
};

/** Over the list: how many skills (or bundles) it shows. */
export function countHtml(st: State): string {
  return `${plural(shownOf(st), unitOf(st))}${savedBundlesHtml(st, true)}`;
}

/**
 * What you saved is counted as you saved it: a saved bundle is one more entry, not its skills,
 * which the skills' count leaves out unless you saved them too. So, with Saved on and the list
 * showing skills and bundles, the counts add " and 1 bundle", and they add up to the Saved
 * switch's. `search`: whether to count only those the search finds.
 */
function savedBundlesHtml(st: State, search: boolean, badge = (s: string) => s): string {
  if (!st.saved || st.show !== "all") return "";
  const rest = search ? st : { ...st, q: "" };
  const n = data.bundles.filter((b) => bundlePasses(b, rest)).length;
  return n ? ` and ${badge(n.toLocaleString("en"))} bundle${n === 1 ? "" : "s"}` : "";
}

/** Every key a Save button can save: what the Saved switch counts (see `account.listed`). */
const listedKeys = new Set([
  ...data.skills.map((s) => saveKey("skill", s.id)),
  ...data.bundles.map((b) => saveKey("bundle", b.id)),
]);
export const isListed = (key: string) => listedKeys.has(key);

/**
 * The search's scope, for one state at a time: what the filters leave for it to look through, in
 * words, counted as the list's heading counts, such as "54 skills" or "2 skills and 1 bundle"; ""
 * when they leave nothing.
 */
let lastScope: { st: State; text: string } | undefined;
const scopeOf = (st: State) => {
  if (lastScope?.st !== st) {
    const rest = { ...st, q: "" };
    lastScope = {
      st,
      text: results(rest).list.length
        ? `${plural(shownOf(rest), unitOf(st))}${savedBundlesHtml(st, false)}`
        : "",
    };
  }
  return lastScope.text;
};

/** How many skills (or bundles) the list below shows, as the lines under the boxes say it: the number highlighted. */
function shownCountHtml(st: State): string {
  const n = shownOf(st);
  return `${badgeHtml(n.toLocaleString("en"))} ${unitOf(st)}${n === 1 ? "" : "s"}${savedBundlesHtml(st, true, badgeHtml)}`;
}

/** Under the search box: what it does, and how many skills (or bundles) the list below shows. */
export const searchNote = (st: State) => `Filters ${shownCountHtml(st)} below.`;

/** The filters, as chips each with its × to remove it. */
function scopeChipsHtml(st: State): string {
  const chips: string[] = [];
  const remove = (kind: string, value: string, label: string) =>
    `<button type="button" class="scope-chip" data-remove="${kind}" data-value="${esc(value)}" aria-label="Remove filter ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`;
  if (st.saved) chips.push(remove("saved", "", "Saved"));
  for (const t of st.tags) chips.push(remove("tag", t, t));
  if (st.repo) chips.push(remove("repo", st.repo, `from ${st.repo}`));
  for (const p of PROP_IDS)
    if (isNarrowed(p, st.ranges[p]))
      chips.push(remove("range", p, `${PROPS[p].label}: ${rangeLabel(p, st.ranges[p])}`));
  return chips.join(" ");
}

/**
 * Beside the count over the list: the filters as chips, and Clear filters. Nothing without filters:
 * the count says how many skills there are.
 */
export function scopeHtml(st: State): string {
  if (!filtersOn(st)) return "";
  return `${scopeChipsHtml(st)} <button type="button" class="link-button" data-action="clear">Clear filters</button>`;
}

/** The prompt's size, its number highlighted, in the line under the agent's box. */
export const tokensHtml = (tokens: number) => `${badgeHtml(`~${compact(tokens)}`)} tokens`;

/** A number highlighted in the line under a box. */
const badgeHtml = (text: string) => `<span class="badge">${esc(text)}</span>`;

/**
 * Under the agent's box: what Find with your agent copies, the list below, and its size. When the
 * search finds nothing, that's what the filters leave: see askState.
 */
export function askLabel(st: State): string {
  if (!askable(st)) return "The list below is empty: there's nothing to copy.";
  const of = askState(st);
  const copies = `Copies a prompt of ${tokensHtml(promptTokens(st))} to your clipboard that includes the TL;DR of`;
  if (of !== st)
    return filtersOn(of)
      ? `${copies} the ${shownCountHtml(of)} the filters leave.`
      : `${copies} all ${shownCountHtml(of)}.`;
  // "the", not "these": it reads right for one, too, as in "the 1 skill below".
  const which = filtersOn(st) || term(st) ? "the" : "all";
  return `${copies} ${which} ${shownCountHtml(st)} below.`;
}

/**
 * Whether there's anything for the agent's prompt to hold: not when the filters leave nothing,
 * nor for a Saved list that's empty or asks to log in. A search that finds nothing still has what
 * the filters leave: see askState.
 */
export const askable = (st: State) => results(askState(st)).list.length > 0;

/**
 * About how many tokens the prompt for a state takes, at 4 characters a token, before the need is
 * typed: a large catalog can be too much for some agents. For one state at a time.
 */
let lastPrompt: { st: State; tokens: number } | undefined;
function promptTokens(st: State): number {
  if (lastPrompt?.st !== st)
    lastPrompt = { st, tokens: Math.round(askPrompt(st, "", href()).length / 4) };
  return lastPrompt.tokens;
}

const rowHtml = (e: Entry, st: State) => (isBundle(e) ? bundleRow(e, st) : skillRow(e, st));

/**
 * Rows outside the skills list, on a page about their repo: what the page passes, in its order,
 * with Downloads highlighted, as they're most installed first. The page adds crowdDefsHtml once.
 */
export function listingHtml(entries: Entry[]): string {
  const st: State = { ...fresh(), sort: "downloads" };
  return `<ol class="skill-list">${entries
    .map((e) => (isBundle(e) ? bundleRow(e, st, true) : skillRow(e, st, true)))
    .join("")}</ol>`;
}

/** The rows from `from` to `to`, to append to the `limit` rows `resultsHtml` rendered. */
export function rowsHtml(st: State, from: number, to: number): string {
  return results(st)
    .list.slice(from, to)
    .map((e) => rowHtml(e, st))
    .join("");
}

/** How many rows `st` lists. */
export const rowCount = (st: State) => results(st).list.length;

/** Instead of the list of what you saved: logged out, or nothing saved yet. */
function savedNote(st: State): string | null {
  if (!st.saved) return null;
  if (!account.user)
    return `<p class="empty"><a href="${esc(loginHref())}" data-login>Log in with GitHub</a> to see what you saved.</p>`;
  // Nothing that's still listed, as the Saved switch counts: a saved skill can leave the list.
  if (![...account.saved].some(isListed))
    return `<p class="empty">Nothing saved yet. Each skill and bundle has a Save button, here in the list and on its page.</p>`;
  return null;
}

/**
 * Instead of the list, when nothing is left to list: whether it's the search that finds nothing
 * among what the filters leave, or the filters that leave nothing, with the way out of each.
 */
function emptyHtml(st: State): string {
  const what = st.show === "all" ? "skill or bundle" : unitOf(st);
  const clear = `<button type="button" class="link-button" data-action="clear">Clear filters</button>`;
  const found = `No ${what} matches “${esc(term(st))}”`;
  const said = !filtersOn(st)
    ? term(st)
      ? `${found}.`
      : `No ${what} to list.`
    : term(st) && scopeOf(st)
      ? `${found} among the ${scopeOf(st)} the filters leave. ${clear}`
      : `No ${what} matches the filters. ${clear}`;
  // A search that finds nothing may be a need in the person's own words, which is the agent's job.
  const ask =
    term(st) && askable(st)
      ? `<br />Describing a need in your own words? <button type="button" class="link-button" data-action="ask">Find with your agent</button>`
      : "";
  return `<p class="empty">${said}${ask}</p>`;
}

/** The count, the active filters and the list, of only its first `limit` rows if given. */
export function resultsHtml(st: State, limit = Infinity): string {
  const { list } = results(st);
  const repoNote = st.repo ? repoById.get(st.repo) : undefined;
  return `
    ${savedNote(st) ?? ""}
    ${repoNote ? `<p class="repo-banner"><a href="https://github.com/${esc(repoNote.id)}">${esc(repoNote.id)}</a>${repoNote.agentReview.description ? ` <span>${esc(repoNote.agentReview.description)}</span>` : ""}</p>` : ""}
    ${
      savedNote(st) !== null
        ? ""
        : list.length
          ? `<ol class="skill-list">${list
              .slice(0, limit)
              .map((e) => rowHtml(e, st))
              .join("")}</ol>`
          : emptyHtml(st)
    }`;
}

/**
 * A slider's histogram's bars (see histograms), each as tall as its count against the tallest; one
 * with a count is at least a few pixels tall, so that it doesn't pass for none. The bars outside the
 * range fade. The client re-renders them with the list, as their counts follow the filters.
 */
export function histogramHtml(st: State, p: Prop): string {
  const bars = histograms(st)[p];
  const max = Math.max(1, ...bars);
  const [lo, hi] = st.ranges[p];
  return bars
    .map(
      (n, i) =>
        `<span${i >= lo && i < hi ? "" : ` class="out"`} style="--h: ${n ? Math.max(0.08, n / max).toFixed(3) : 0}" title="${esc(`${rangeLabel(p, [i, i + 1])}: ${plural(n, unitOf(st))}`)}"></span>`,
    )
    .join("");
}

/**
 * Under a histogram, some of its stops' values, each under its stop: for counts, 0 and the powers
 * of 10 at least 3 steps apart, such as 0, 100, 1K, 10K; for dates, the ages.
 */
function axisHtml(p: Prop): string {
  const { stops, date } = PROPS[p];
  const last = lastStop(p);
  const labels: [number, string][] = [];
  if (date) AGES.forEach((n, i) => labels.push([i + 1, n === 365 ? "1y" : `${n}d`]));
  else
    stops.forEach((v, i) => {
      const decade = v === 0 || Number.isInteger(Math.log10(v as number));
      if (decade && (!labels.length || i - labels[labels.length - 1][0] >= 3))
        labels.push([i, compact(v as number)]);
    });
  return labels.map(([i, text]) => `<span style="--at: ${i / last}">${text}</span>`).join("");
}

/**
 * Inline, right after the search box, so that it runs before the rest of the page shows. The page
 * is pre-rendered unfiltered, and its script, list-client.ts, comes last, after megabytes of rows:
 * - A link to another list, such as a search's, would show the unfiltered one until then, and a
 *   list returned to, such as from a skill's page, its top. It marks <html data-pending>, which
 *   hides the settings and the list (see style.css) until the script has rendered what the link
 *   asks for, where it was left, and puts the link's search in the box.
 * - A search typed until then would do nothing. It marks the box, for the script to search for
 *   what it holds.
 */
const PENDING_SCRIPT = `(() => {
  const q = document.getElementById("q");
  if (location.search || history.state?.at) {
    document.documentElement.dataset.pending = "";
    q.value = new URLSearchParams(location.search).get("q") || "";
  }
  q.addEventListener("input", () => { q.dataset.typed = ""; }, { once: true });
})();`;

const CHEVRON = `<svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>`;

/**
 * A pill per property, with its range; a click opens its two-handled slider in a popover under the
 * pill (see list-client.ts), with a histogram above it. The client updates them in place while a
 * slider is dragged.
 */
export function rangesHtml(st: State): string {
  return PROP_IDS.map((p) => {
    const [lo, hi] = st.ranges[p];
    const last = lastStop(p);
    const { label } = PROPS[p];
    const value = `<span data-range-label="${p}">${rangeLabel(p, [lo, hi])}</span>`;
    const handle = (end: 0 | 1, v: number) =>
      `<input type="range" min="0" max="${last}" step="1" value="${v}" data-range="${p}" data-end="${end}" aria-label="${label}, ${end ? "to" : "from"}" aria-valuetext="${rangeLabel(p, [lo, hi])}" />`;
    const { icon, tag } = PROPS[p];
    // The pill says the word the rows say under a shared icon, such as Total, to fit the settings'
    // line; its popover says the whole name. A name on its own, as Age's and Stars', whose
    // icons are theirs alone, gives way to the range once it narrows the list: see .range-word in
    // style.css.
    const short = tag
      ? `<span class="range-name">${icon}<span aria-hidden="true">${tag}</span><span class="sr-only">${label}</span></span>`
      : `<span class="range-name">${icon}<span class="range-word">${label}</span></span>`;
    const name = `<span class="range-name">${icon}${label}</span>`;
    return `<div class="range${isNarrowed(p, [lo, hi]) ? " narrowed" : ""}" data-range-section="${p}"><button type="button" class="range-pill" data-action="range" data-value="${p}" title="${label}" aria-expanded="false" aria-controls="range-pop-${p}">${short}<span class="range-value">${value}${CHEVRON}</span></button><div class="range-pop" id="range-pop-${p}" role="group" aria-label="${label}" hidden><div class="range-pop-head">${name}${value}</div><div class="histogram" data-histogram="${p}" aria-hidden="true">${histogramHtml(st, p)}</div><div class="histogram-axis" aria-hidden="true">${axisHtml(p)}</div><div class="slider" data-slider="${p}" style="--lo: ${lo / last}; --hi: ${hi / last}">${handle(0, lo)}${handle(1, hi)}</div></div></div>`;
  }).join("");
}

/** The presets' buttons, the one the state matches pressed. Re-rendered with the list. */
export const presetsHtml = (st: State) =>
  (Object.keys(PRESETS) as Preset[])
    .map((id) => {
      const p = PRESETS[id];
      const { sort, ranges } = presetPatch(id);
      const on =
        st.sort === sort && !st.asc && PROP_IDS.every((r) => sameRange(st.ranges[r], ranges[r]));
      return `<button type="button" class="preset" data-preset="${id}" data-label="${esc(p.label)}" aria-pressed="${on}" title="${esc(p.title)}">${esc(p.label)}</button>`;
    })
    .join("");

/**
 * Sort by: its menu and its order. Re-rendered with the list, since a search adds Best match. The
 * sort is a menu of its own, rather than a <select>, to show each option's icon: see list-client.ts
 * for its keys.
 */
export function sortHtml(st: State): string {
  // The sorts, each with its icon: Best match only while searching.
  const sorts: [Sort, string, string][] = [
    ...(term(st) ? [["match", SEARCH, "Best match"] as [Sort, string, string]] : []),
    ...PROP_IDS.map((p): [Sort, string, string] => [p, PROPS[p].icon, PROPS[p].label]),
    ["growth", GROWTH.icon, GROWTH.label],
  ];
  const current = sorts.find(([id]) => id === st.sort) ?? sorts[0];
  // The button keeps the room for the longest name, so that picking another sort doesn't resize it.
  const longest = sorts.reduce((a, [, , label]) => (label.length > a.length ? label : a), "");
  const options = sorts
    .map(
      ([id, icon, label]) =>
        `<li role="option" id="sort-${id}" data-sort="${id}" aria-selected="${id === st.sort}" tabindex="-1">${icon}<span>${label}</span>${id === st.sort ? CHECK : ""}</li>`,
    )
    .join("");
  // The order: both directions as arrows, the current one pressed, their words in their labels.
  const dates = st.sort !== "match" && st.sort !== "growth" && PROPS[st.sort].date;
  const direction = (asc: boolean, arrow: string, words: string) =>
    `<button type="button" data-order="${asc ? "asc" : "desc"}" aria-pressed="${st.asc === asc}" aria-label="${words}" title="${words}">${arrow}</button>`;
  const order =
    st.sort === "match"
      ? ""
      : `<div class="order" role="group" aria-label="Order">${direction(false, "↓", dates ? "Newest first" : "Highest first")}${direction(true, "↑", dates ? "Oldest first" : "Lowest first")}</div>`;
  return `
    <div class="sort-head"><h2 id="sort-label">Sort by</h2>${order}</div>
    <div class="sort-menu">
      <button type="button" class="sort-button" id="sort" data-action="sort-menu" aria-haspopup="listbox" aria-expanded="false" aria-controls="sort-options" aria-labelledby="sort-label sort">${current[1]}<span data-longest="${longest}">${current[2]}</span>${CHEVRON}</button>
      <ul class="sort-options" id="sort-options" role="listbox" aria-labelledby="sort-label" hidden>${options}</ul>
    </div>`;
}

/**
 * Show's buttons: Both, Skills or Bundles. Re-rendered with the list. `data-label`, as on the
 * presets, is the room a button keeps for its words once pressed, and bold: see style.css. Both
 * says what it means in its tooltip, and to a screen reader, which meets it before the two it's
 * the both of.
 */
export const showHtml = (st: State) =>
  SHOWS.map(
    ([v, label, full]) =>
      `<button type="button" data-show="${v}" data-label="${esc(label)}" aria-pressed="${st.show === v}"${
        full ? ` title="${esc(full)}" aria-label="${esc(`${label}: ${full.toLowerCase()}`)}"` : ""
      }>${esc(label)}</button>`,
  ).join("");

/**
 * Before Show's buttons: a switch that shows only what you saved. list-client.ts keeps it in step
 * with the state rather than re-rendering it, so that it slides; account-client.ts keeps its count.
 * On narrow screens, it stays in view while the Filters button hides the rest of the line.
 */
const savedSwitchHtml = (st: State) =>
  `<button type="button" id="saved-switch" class="saved-switch" role="switch" aria-checked="${st.saved}" data-action="saved" title="Show only what you saved">${bookmarkSvg}<span>Saved</span><span class="n" data-saved-count>${savedCount()}</span><span class="switch" aria-hidden="true"></span></button>`;

/**
 * The skills list's page, under the site's header. Across the page's top: its heading; the two ways
 * to search; one line of every setting: the presets, the sort, the number filters and Show. Under
 * them, the list and the tags on the right, each under its count, the list's with the filters'
 * chips. On
 * narrow screens, the presets and the Saved switch stay in view, and the Filters button, between
 * them, opens the line's other settings; the tags come before the list, behind their count, which
 * opens them. The tags come before the list for the keyboard too, some 150 of them: a link atop
 * them, which only shows once it has the focus, skips to the list. `reviewed` is how many skills SkillHub reviewed, from review.ts, which only the
 * server reads: the line saying so isn't re-rendered.
 */
export function listView(st: State, reviewed: number): string {
  return `
    <div class="list-top">
      <div class="list-top-in">
        <div class="list-title">
          <h1 class="list-head">Agent skills</h1>
          <p class="list-sub"><a href="${href("about/")}">Curated from ${reviewed.toLocaleString("en")} reviewed skills</a></p>
        </div>
        <div class="finder">
          <div class="agent-field" data-action="focus-need">
            <svg class="ask-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6.5V4M2 11v3M18 11v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><rect x="4" y="6.5" width="12" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="10" cy="3" r="1.25" fill="currentColor" /><circle cx="7.75" cy="10.75" r="1.25" fill="currentColor" /><circle cx="12.25" cy="10.75" r="1.25" fill="currentColor" /><path d="M8.5 13.75h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <label for="need" class="sr-only">What you need, for your agent</label>
            <input id="need" type="text" placeholder="Describe what you need" autocomplete="off" aria-describedby="ask-label scope" />
            <button type="button" class="ask-button" data-action="ask">Find with your agent</button>
          </div>
          <div class="search-field" data-action="focus-search">
            <svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <label for="q" class="sr-only">Search</label>
            <input id="q" type="search" value="${esc(st.q)}" placeholder="Search" autocomplete="off" spellcheck="false" aria-describedby="search-note scope" />
          </div>
          <p id="ask-label" class="ask-label" aria-live="polite">${askLabel(st)}</p>
          <p id="search-note" class="search-note">${searchNote(st)}</p>
          <script>${PENDING_SCRIPT}</script>
        </div>
        <div id="settings" class="settings-line" role="group" aria-label="Settings">
          <section class="setting preset-group" aria-labelledby="presets-label">
            <h2 id="presets-label">Presets</h2>
            <div id="presets" class="presets" role="group" aria-labelledby="presets-label">${presetsHtml(st)}</div>
          </section>
          <button type="button" class="filters-toggle" data-action="filters" aria-controls="settings" aria-expanded="false">Filters</button>
          <section id="sort-group" class="setting sort-group">${sortHtml(st)}</section>
          <section class="setting filter-group" aria-labelledby="filter-label">
            <h2 id="filter-label">Filter</h2>
            <div class="ranges">${rangesHtml(st)}</div>
          </section>
          <section class="setting show-group" aria-labelledby="show-label">
            <h2 id="show-label">Show</h2>
            <div class="show-row">
              ${savedSwitchHtml(st)}
              <div id="show" class="show-switch" role="group" aria-labelledby="show-label">${showHtml(st)}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
    <div class="skills-view">
      <aside id="filters" aria-label="Tags">
        <a class="skip-tags" href="#results">Skip the tags, to the list</a>
        <div id="facets">${facetsHtml(st, false)}</div>
      </aside>
      <div class="list-main">
        <div class="list-count-row">
          <h2 id="count" class="list-count" aria-live="polite" tabindex="-1">${countHtml(st)}</h2>
          <p id="scope" class="scope">${scopeHtml(st)}</p>
        </div>
        <section id="results" aria-label="Skills">${resultsHtml(st)}</section>
        ${crowdDefsHtml()}
      </div>
    </div>`;
}
