/** Where skills and bundles are on GitHub, from their ids. */

import type { Bundle, Skill } from "../data/types.ts";

/** The GitHub repo (`owner/name`) a skill lives in, and the directory inside it. */
export function github(skill: Skill): { repo: string; dir: string } {
  const [owner, name, ...dir] = skill.id.split("/");
  return { repo: `${owner}/${name}`, dir: dir.join("/") };
}

/** The repo a bundle is in. */
export const bundleRepo = (bundle: Bundle) => bundle.id.split("@")[0];
