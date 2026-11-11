import vike from "vike/plugin";
import type { UserConfig } from "vite";
import { EDGE_CASES, siteOf } from "../data/edge-cases.ts";

/**
 * Where the site is built, and what its dev server keeps: the real site and the edge cases' (see
 * ../data/edge-cases.ts) each have their own. Here rather than in pages/+config.ts, with the other
 * Vite settings, as Vike only takes the build's directory from this file: set there, it builds the
 * pages' browser code where it says, but still renders the pages from dist/.
 */
export default {
  plugins: [vike()],
  build: { outDir: siteOf().dist.replace("website/", "") },
  // The two sites' dev servers can run at once: each keeps what it prepared to itself.
  cacheDir: EDGE_CASES ? "../node_modules/.vite-edge-cases" : undefined,
} satisfies UserConfig;
