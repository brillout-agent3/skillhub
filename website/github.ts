/** Where skills and bundles are on GitHub, from their ids. */

/** The GitHub repo (`owner/name`) a skill lives in, and the directory inside it. */
export function github(skill: { id: string }): { repo: string; dir: string } {
  const [owner, name, ...dir] = skill.id.split("/");
  return { repo: `${owner}/${name}`, dir: dir.join("/") };
}

/** The repo a bundle is in. */
export const bundleRepo = (bundle: { id: string }) => bundle.id.split("@")[0];
