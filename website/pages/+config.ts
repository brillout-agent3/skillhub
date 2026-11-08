import { parse } from "comment-json";
import type { Config, PageContextServer } from "vike/types";
import type { Data } from "../../data/types.ts";
import { forClient, searchWords } from "../client-data.ts";

/**
 * Imports the data files, which are JSONC, as JSON, without their comments. The browser gets a
 * trimmed skills.jsonc, and `skills.jsonc?search-words` is the prose it leaves out: see
 * ../client-data.ts.
 */
const jsonc = {
  name: "jsonc",
  transform(this: { environment?: { config: { consumer: string } } }, code: string, id: string) {
    const [file, query = ""] = id.split("?");
    if (!file.endsWith(".jsonc")) return;
    let value: unknown = parse(code, undefined, true);
    if (file.endsWith("/skills.jsonc")) {
      if (new URLSearchParams(query).has("search-words")) value = searchWords(value as Data);
      else if (this.environment?.config.consumer === "client") forClient(value as Data);
    }
    return { code: `export default ${JSON.stringify(value)};`, map: null };
  },
};

/**
 * Fails the client build when it imports a file meant for pages only, which render on the server:
 * crawl.jsonc, which nobody browsing needs, and server-data.ts, whose types claim the fields the
 * browser's copy of skills.jsonc leaves out (see ../client-data.ts).
 */
const SERVER_ONLY = ["/data/crawl.jsonc", "/website/server-data.ts"];
const serverOnly = {
  name: "server-only",
  transform(
    this: { environment?: { config: { consumer: string } }; error(message: string): never },
    _code: string,
    id: string,
  ) {
    const file = id.split("?")[0];
    if (this.environment?.config.consumer === "client" && SERVER_ONLY.some((f) => file.endsWith(f)))
      this.error(`${file} is for pages only, but the browser's code imports it.`);
  },
};

export default {
  // Every page is HTML rendered at build time; the pages that need JavaScript add a +client.ts.
  prerender: true,
  trailingSlash: true,
  vite: {
    plugins: [jsonc, serverOnly],
    // In `pnpm dev`, the Worker runs beside Vike's dev server: see ../../scripts/dev.ts.
    server: { proxy: { "/api": "http://localhost:8787" } },
  },
  meta: {
    // Pages render to HTML at build time only, so Page never runs in the browser. Server-only, it
    // and what it imports, such as crawl.jsonc, stay out of the client build.
    Page: { env: { server: true } },
    title: { env: { server: true } },
    description: { env: { server: true } },
  },
  title: "SkillHub: popular agent skills, tagged",
  description:
    "Browse the most popular agent skills, ranked by installs and tagged by what they do, need and change.",
} satisfies Config;

type PerPage = string | ((pageContext: PageContextServer) => string);

declare global {
  namespace Vike {
    interface Config {
      /** The page's `<title>`. */
      title?: PerPage;
      /** The page's `<meta name="description">`. */
      description?: PerPage;
    }
  }
}
