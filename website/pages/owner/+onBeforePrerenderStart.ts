import { listingsByOwner } from "../../listings.ts";
import { idPath } from "../../skills.ts";

/** One page per owner of a repo with a skill on the site. */
export const onBeforePrerenderStart = () =>
  [...listingsByOwner.keys()].map((o) => `/${idPath(o)}/`);
