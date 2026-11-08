/**
 * `pnpm dev`: the site at http://localhost:3000 from Vike's dev server, which hands /api/* to the
 * Worker, run by `wrangler dev` on port 8787 (see the proxy in website/pages/+config.ts).
 * `pnpm preview`, after `pnpm build`: the built site and the Worker at http://localhost:3000, both
 * from `wrangler dev`, as Cloudflare serves them.
 *
 * Both use a local D1 database, in .wrangler/, and log in as a test user instead of with GitHub:
 * see DEV_LOGIN in worker/index.ts.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const preview = process.argv.includes("--preview");
const pnpm = (args: string[]) => ["pnpm", ["exec", ...args]] as const;

execFileSync(...pnpm(["wrangler", "d1", "migrations", "apply", "skillhub", "--local"]), {
  stdio: "inherit",
});
// `wrangler dev` wants the assets' directory to exist, built or not.
mkdirSync("website/dist/client", { recursive: true });

const children = [
  spawn(
    ...pnpm([
      "wrangler",
      "dev",
      "--port",
      preview ? "3000" : "8787",
      "--var",
      "DEV_LOGIN:1",
      // The Worker sees localhost, rather than skillhub.build from its route.
      "--infer-origin-from-routes=false",
    ]),
    { stdio: "inherit" },
  ),
];
if (!preview)
  children.push(
    spawn(...pnpm(["vike", "dev", "--root", "website", "--port", "3000"]), { stdio: "inherit" }),
  );
// When one stops, stop the other.
for (const child of children)
  child.on("exit", (code) => {
    for (const other of children) other.kill();
    process.exit(code ?? 0);
  });
