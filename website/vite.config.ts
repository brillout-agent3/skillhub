import vike from "vike/plugin";
import type { UserConfig } from "vite";
import { EDGE_CASES, siteOf } from "../data/edge-cases.ts";

/**
 * Where the site is built: website/dist/, which a deploy takes, or the edge cases' own directory
 * (see ../data/edge-cases.ts). It's the one Vite setting that can't be in pages/+config.ts, with
 * the others: set there, Vike builds the pages' browser code where it says, but still renders the
 * pages from dist/.
 */
export default {
  plugins: [vike()],
  build: { outDir: siteOf().dist.replace("website/", "") },
  // The two sites' dev servers can run at once: each keeps what it prepared to itself.
  cacheDir: EDGE_CASES ? "../node_modules/.vite-edge-cases" : undefined,
} satisfies UserConfig;
