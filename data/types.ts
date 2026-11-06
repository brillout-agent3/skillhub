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
  /** When each kind of data is from (YYYY-MM-DD). */
  asOf: {
    /** When the installs were collected, which crawl.ts does daily. */
    installs: string;
    /** When the GitHub stars were collected, which crawl.ts does daily. */
    stars: string;
    /** When the tags were last assigned. */
    tags: string;
  };
  /** The tag dimensions, with the values their tags can take. */
  facets: Facet[];
  /** The GitHub repos of the skills and bundles, one entry each. */
  repos: Repo[];
  /** Skills meant to be installed together. */
  bundles: Bundle[];
  /** The approved skills: the ones the site lists. */
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
  /**
   * At the minimums (`MINIMUMS` in ../scripts/data.ts) or above, most installed first: waiting for
   * an agent to approve or disqualify them, with the add-skill skill.
   */
  qualified: Crawled[];
  /** Below the minimums, most installed first. */
  unqualified: Crawled[];
  /** Not to be shown, each with why, and with no agent data: no tags, no TLDR, no copy of its SKILL.md. */
  disqualified: Disqualified[];
}

/** A skill of the skills.sh top 600 that's qualified or unqualified. */
export interface Crawled {
  /** Its name on skills.sh: the end of its skills.sh page. */
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

export interface Disqualified {
  /** Its skills.sh page. */
  url: string;
  /** Why it's disqualified. */
  note: string;
}

/** A tag dimension. Tags are written `facet:value`, except topics, which have no prefix. */
export interface Facet {
  /** Its id: the prefix of its tags, `id:value`. */
  id: string;
  /** Its name, as the site shows it. */
  name: string;
  /** The question its values answer. */
  question: string;
  /** How many values of this facet a skill carries. */
  count: "one" | "one or more" | "at most one" | "one to five" | "any";
  /** The values its tags can take. */
  values: {
    /** Its id: the tag is `facet:id`, or just `id` for a topic. */
    id: string;
    /** A name for chips, when the id alone isn't one. */
    label?: string;
    /** What it means: for people browsing, and for agents tagging skills. */
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
  groups?: {
    /** The group's heading. */
    name: string;
    /** The ids of its values. */
    values: string[];
  }[];
}

export interface Repo {
  /** GitHub `owner/name`. */
  id: string;
  /** Its GitHub page. */
  url: string;
  /** `skills`: exists to ship skills. `project`: a product that also ships a skill. `index`: a curated list or catalog. */
  kind: "skills" | "project" | "index";
  /** GitHub stars, or null when unknown. crawl.ts refreshes them for the repos of approved skills and bundles. */
  stars: number | null;
  /** The repo in one line, such as its GitHub description, or null when it has none. */
  description: string | null;
  /** How many of the repo's skills were in the skills.sh all-time top 600. */
  leaderboardSkills: number | null;
  /** Something to know about the repo, such as where its star count comes from. */
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
  /** Its name on skills.sh: the end of its skills.sh page. */
  name: string;
  /** One sentence on what it does, shown until it has a TLDR. */
  description: string;
  /** What the skill is and does, written from the SKILL.md its permalink points to. */
  tldr?: Tldr;
  /** Its tags, `facet:value` or just the value for a topic, from the values `facets` defines. */
  tags: string[];
  /** Its listing on skills.sh. */
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
  /** Its name, as the site shows it. */
  name: string;
  /** One sentence, shown until it has a TLDR. */
  description: string;
  /** What the bundle is and how its skills work together, written from the repo at its permalink's commit. */
  tldr?: Tldr;
  /** Its skills, in the order they're used. */
  skills: BundleSkill[];
  /** How to install all of its skills, one command per way, as its README gives them. */
  install: {
    /** Where the command works, such as "Claude Code plugin". */
    label: string;
    /** The command to run. */
    command: string;
  }[];
  /** Words added plus words removed across its skills' SKILL.md since the commit the TLDR summarizes, or all their words when there's no TLDR. */
  skew: number;
}

export interface BundleSkill {
  /** Where its SKILL.md lives, as for a skill's `id`. */
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
  glance: {
    /** A few words, such as "Use it when". */
    label: string;
    /** What the label introduces. */
    text: string;
  }[];
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
  /** The command skills.sh gives to install it. */
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
