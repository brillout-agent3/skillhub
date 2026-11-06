/**
 * The shape of the data files: skills.jsonc, as `Data` describes, and crawl.jsonc, as `Crawl`
 * describes. ../scripts/schema.ts generates their JSON Schemas from these types.
 */

/**
 * The shape of skills.jsonc, the single data file behind the site: the approved skills, the ones
 * it shows. The skills the crawl found but that aren't approved are in crawl.jsonc.
 */
export interface Data {
  /** The JSON Schema of this file, generated from this interface: for editors. */
  $schema: string;
  /** When the data was last edited (YYYY-MM-DD). */
  updated: string;
  /** When each kind of number was collected, which crawl.ts does daily, and when the tags were assigned (YYYY-MM-DD). */
  asOf: Record<"installs" | "stars" | "tags", string>;
  facets: Facet[];
  repos: Repo[];
  bundles: Bundle[];
  skills: Skill[];
}

/**
 * The shape of data/crawl.jsonc: every skill the crawl has seen in the skills.sh all-time top 600
 * that isn't approved (the approved ones are in skills.jsonc), keyed by its skills.sh page. The two
 * files are cumulative: a skill that lands in either never leaves them, only its state changes.
 * Unlike skills.jsonc, crawl.jsonc takes any skill, such as one a website publishes.
 */
export interface Crawl {
  /** The JSON Schema of this file, generated from this interface: for editors. */
  $schema: string;
  /** When crawl.ts last ran (YYYY-MM-DD). */
  asOf: string;
  /** What a crawled skill needs to be queued: all-time installs, and its GitHub repo's stars. */
  minimums: { installs: number; stars: number };
  /** Below the minimums, most installed first. */
  crawled: Crawled[];
  /** At the minimums or above, most installed first: waiting for an agent to approve or skip them, with the add-skill skill. */
  queued: Crawled[];
  /** Not to be shown, each with why, and with no agent data: no tags, no TLDR, no copy of its SKILL.md. */
  skipped: Skipped[];
}

export interface Crawled {
  name: string;
  /** Its GitHub repo, `owner/name`, as skills.sh names it: possibly an old name the repo redirects from. */
  repo: string;
  /** Whether skills.sh shows its publisher as verified. */
  official: boolean;
  /** Its repo's GitHub stars, or null when unknown. */
  stars: number | null;
  /** The last day the crawl saw it in the top 600, which its numbers are from (YYYY-MM-DD). */
  seen: string;
  /** Its `skills.sh` field once it's approved. */
  "skills.sh": SkillsSh;
}

export interface Skipped {
  /** Its skills.sh page. */
  url: string;
  note: string;
}

/** A tag dimension. Tags are written `facet:value`, except topics, which have no prefix. */
export interface Facet {
  id: string;
  name: string;
  question: string;
  /** How many values of this facet a skill carries. */
  count: "one" | "one or more" | "at most one" | "one to five" | "any";
  values: {
    id: string;
    /** A name for chips, when the id alone isn't one. */
    label?: string;
    description?: string;
    /**
     * Makes the value a parent of these values of the same facet: skills don't carry it, they
     * have it through any of them, and filtering on it lists them all.
     */
    includes?: string[];
  }[];
  /** `false` for topics, which are written without a `topic:` prefix. */
  prefix?: false;
  /** Display groups (topics only). */
  groups?: { name: string; values: string[] }[];
}

export interface Repo {
  /** GitHub `owner/name`. */
  id: string;
  url: string;
  /** `skills`: exists to ship skills. `project`: a product that also ships a skill. `index`: a curated list or catalog. */
  kind: "skills" | "project" | "index";
  /** GitHub stars, or null when unknown. crawl.ts refreshes them for the repos of approved skills and bundles. */
  stars: number | null;
  description: string | null;
  /** How many of the repo's skills were in the skills.sh all-time top 600. */
  leaderboardSkills: number | null;
  note?: string;
}

/** A skill on GitHub that skills.sh lists. SkillHub lists no other skills. */
export interface Skill {
  /**
   * Unique: where the skill's SKILL.md lives, as the GitHub repo and the directory inside it,
   * `owner/name/path/to/dir` (just `owner/name` for a SKILL.md at the root). The repo has an
   * entry in `repos`.
   */
  id: string;
  name: string;
  description: string;
  /** What the skill is and does, written from the SKILL.md its permalink points to. */
  tldr?: Tldr;
  tags: string[];
  "skills.sh": SkillsSh;
  /** The copy of the skill's SKILL.md at `data/skill-snapshots/<id>.md`, which `sync.ts` keeps current. */
  skillMd?: SkillMd;
  /** Something to know before installing. */
  note?: string;
}

/**
 * Skills of one repo meant to be installed together, such as the steps of a workflow. Its skills
 * are listed inside its entry; those worth installing alone also get an entry of their own.
 */
export interface Bundle {
  /** The GitHub repo, `owner/name`, or `owner/name@part` for one of several bundles in a repo. */
  id: string;
  name: string;
  /** One sentence, shown until it has a TLDR. */
  description: string;
  /** What the bundle is and how its skills work together, written from the repo at its permalink's commit. */
  tldr?: Tldr;
  /** Its skills, in the order they're used. */
  skills: BundleSkill[];
  install: { label: string; command: string }[];
  /** Words added plus words removed across its skills' SKILL.md since the commit the TLDR summarizes, or all their words when there's no TLDR. */
  skew: number;
}

export interface BundleSkill {
  id: string;
  /**
   * Whether it's worth installing alone, with no other skill of the bundle: then it also gets an
   * entry of its own in the skills list. A skill that loads another one of the bundle, or only
   * works on another's output, isn't.
   */
  standalone: boolean;
  /** For a skill that isn't standalone: what it needs from the rest of the bundle. */
  note?: string;
}

export interface Tldr {
  /** Short labelled facts to place the skill quickly, most telling first, such as "Use it when". */
  glance: { label: string; text: string }[];
  /** Prose that explains what the skill does. */
  text: string;
  /** GitHub permalink to what the TLDR summarizes: the skill's directory at a commit. For a bundle, its repo at a commit. */
  permalink: string;
}

export interface SkillMd {
  /** The GitHub commit the copy was taken from. */
  version: string;
  /** When the copy last changed (YYYY-MM-DD). */
  updated: string;
  /** Words added plus words removed since the SKILL.md the TLDR summarizes, or all its words when there's no TLDR. */
  skew: number;
}

export interface SkillsSh {
  /** The skill's page on skills.sh. */
  url: string;
  install: string;
  /**
   * All-time installs, or null when unknown: exact for the skills.sh all-time top 600, else from
   * the skill's skills.sh page, which rounds them to three digits (such as 26.5K).
   */
  installs: number | null;
  /** Installs per week for the 8 weeks up to the installs snapshot, oldest first. */
  weeklyInstalls: number[] | null;
  /** When skills.sh first saw the skill (YYYY-MM-DD). */
  firstSeen: string | null;
}
