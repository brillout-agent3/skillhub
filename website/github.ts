/** Where skills and bundles are on GitHub, from their ids. */

/** The GitHub repo (`owner/name`) a skill lives in, and the directory inside it. */
export function github(skill: { id: string }): { repo: string; dir: string } {
  const [owner, name, ...dir] = skill.id.split("/");
  return { repo: `${owner}/${name}`, dir: dir.join("/") };
}

/**
 * Where a skill's page is on this site: its repo and its name, as on skills.sh, such as
 * vercel-labs/agent-desktop/agent-desktop for vercel-labs/agent-desktop/skills/agent-desktop.
 * `pnpm run check` makes sure no two skills share one.
 */
export const skillPage = (skill: { id: string; name: string }) =>
  `${github(skill).repo}/${skill.name}`;

/** The repo a bundle is in. */
export const bundleRepo = (bundle: { id: string }) => bundle.id.split("@")[0];
