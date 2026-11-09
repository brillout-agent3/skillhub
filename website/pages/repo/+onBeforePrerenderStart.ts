import { listingByPage } from "../../listings.ts";
import { idPath } from "../../skills.ts";

/** One page per repo with a skill on the site. */
export const onBeforePrerenderStart = () => [...listingByPage.keys()].map((r) => `/${idPath(r)}/`);
