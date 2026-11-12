/** Where skills and bundles are on GitHub, from their ids. */

/** The GitHub repo (`owner/name`) a skill lives in, and the directory inside it. */
export function github(skill: { id: string }): { repo: string; dir: string } {
  const [owner, name, ...dir] = skill.id.split("/");
  return { repo: `${owner}/${name}`, dir: dir.join("/") };
}

/*
 * Where pages are on this site: an owner's, such as vercel-labs; a repo's, such as
 * vercel-labs/agent-desktop; a skill's, its repo's and its name, such as
 * vercel-labs/agent-desktop/agent-desktop for vercel-labs/agent-desktop/skills/agent-desktop; and
 * a bundle's, its id under bundle/, such as bundle/mattpocock/skills/writing for
 * mattpocock/skills@writing.
 * Lowercase, as on skills.sh: GitHub ignores case, and the ids spell some owners two ways, such as
 * AgriciDaniel and agricidaniel, which get one page. `pnpm run check` makes sure no two skills
 * share a page, nor two bundles, and that none is taken by the site's other pages. An address
 * written with capitals, as GitHub writes it, leads to its lowercase page, and a bundle's with an
 * @, as it once was, to its page: see pages/_error.
 */

/** The page of the owner of a repo (`owner/name`). */
export const ownerPage = (repo: string) => repo.split("/")[0].toLowerCase();
/** The page of a repo (`owner/name`). */
export const repoPage = (repo: string) => repo.toLowerCase();
/** The page of a skill. */
export const skillPage = (skill: { id: string; name: string }) =>
  `${repoPage(github(skill).repo)}/${skill.name.toLowerCase()}`;

/**
 * The page of a bundle: its id, with a slash for the @ before its name. Not the @ itself, as it
 * once was: Cloudflare serves a file whose path has an @ at the address that spells it %40, and
 * redirects the one with the @ there. So each link to such a bundle cost a redirect, and the
 * address bar read skills%40writing.
 */
export const bundlePage = (bundle: { id: string }) =>
  `bundle/${bundle.id.toLowerCase().replace("@", "/")}`;

/** The repo a bundle is in. */
export const bundleRepo = (bundle: { id: string }) => bundle.id.split("@")[0];
