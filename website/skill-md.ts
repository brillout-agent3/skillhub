/** The copies of every skill's SKILL.md, which ../scripts/sync.ts keeps in ../data/skill-snapshots/. */

import { diffArrays } from "diff";
import type { Skill } from "./types.ts";

/** Where the copy of a skill's SKILL.md lives, from the repo root. Not `<id>/SKILL.md`, so that `npx skills` doesn't take this repo for a skill bundle. */
export const copyPath = (skill: Skill) => `data/skill-snapshots/${skill.id}.md`;

/** How far apart two versions of a SKILL.md are: words added plus words removed. */
export function skew(before: string, after: string): number {
  const words = (text: string) => text.split(/\s+/).filter(Boolean);
  let n = 0;
  for (const part of diffArrays(words(before), words(after)))
    if (part.added || part.removed) n += part.value.length;
  return n;
}

const PERMALINK = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([0-9a-f]{40})(?:\/(.+))?$/;

/** The SKILL.md in the directory a permalink points to, as a raw file URL. */
export function rawUrl(permalink: string): string | null {
  const m = PERMALINK.exec(permalink);
  if (!m) return null;
  const [, repo, commit, path = ""] = m;
  return `https://raw.githubusercontent.com/${repo}/${commit}/${path ? `${path}/SKILL.md` : "SKILL.md"}`;
}
