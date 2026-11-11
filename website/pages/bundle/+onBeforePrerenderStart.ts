import { bundlePage } from "../../github.ts";
import { data, idPath } from "../../skills.ts";

/** One page per bundle. */
export const onBeforePrerenderStart = () => data.bundles.map((b) => `/${idPath(bundlePage(b))}/`);
