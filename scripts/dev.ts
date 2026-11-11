/**
 * `pnpm dev`: the site at http://localhost:3000 from Vike's dev server, which hands /api/* to the
 * Worker, run by `wrangler dev` on port 8787 (see the proxy in website/pages/+config.ts).
 * `pnpm preview`, after `pnpm build`: the built site and the Worker at http://localhost:3000, both
 * from `wrangler dev`, as Cloudflare serves them.
 *
 * Both use a local D1 database, in .wrangler/, and log in as a test user instead of with GitHub:
 * see DEV_LOGIN in worker/index.ts. `--fresh` empties the database first: `pnpm dev --fresh`.
 *
 * Both say "Ready" once the site and the Worker answer, which is what a script or an agent waits
 * for, and stop on Ctrl-C. `pnpm dev:stop` stops the ones running in this checkout from anywhere
 * else, such as one left running in the background.
 *
 * With SKILLHUB_DATA=edge-cases, both serve the edge cases' catalog instead, beside the real one:
 * on ports, with a build and with a database of its own. See data/edge-cases.ts.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { EDGE_CASES, siteOf } from "../data/edge-cases.ts";

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const site = siteOf();
const SITE = `http://localhost:${site.port}`;
/** The site's port; and in dev, the Worker's, which Vike's dev server proxies to. */
const PORTS = preview ? [site.port] : [site.port, site.workerPort];
/** How to say a command of this site's, such as `pnpm build`. */
const pnpm = (command: string) => `${EDGE_CASES ? "SKILLHUB_DATA=edge-cases " : ""}pnpm ${command}`;
/**
 * The servers' own commands rather than `pnpm exec`, which doesn't pass a SIGTERM on to them: they
 * would outlive this script, and hold its ports.
 */
const bin = (name: string) => `node_modules/.bin/${name}`;
/** This script's process id and its servers', for `pnpm dev:stop`: a file for each site that runs. */
const PIDS = EDGE_CASES ? ".wrangler/dev-edge-cases.pids" : ".wrangler/dev.pids";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether a process id is still one of ours, rather than gone, or another process that got it since. */
function ours(pid: number): boolean {
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return /scripts\/dev\.ts|wrangler|vike/.test(command);
  } catch {
    // `ps` fails when there's no such process.
    return false;
  }
}

/**
 * `pnpm dev:stop`: stops every `pnpm dev` and `pnpm preview` of this checkout, and their servers:
 * the real site's and the edge cases'.
 */
async function stopRunning() {
  const files = existsSync(".wrangler")
    ? readdirSync(".wrangler").filter((file) => file.endsWith(".pids"))
    : [];
  let stopped = false;
  for (const file of files.map((file) => `.wrangler/${file}`)) {
    const recorded = readFileSync(file, "utf8").split("\n").map(Number);
    const running = () => recorded.filter((pid) => pid && ours(pid));
    const signal = (pids: number[], name: NodeJS.Signals) => {
      for (const pid of pids)
        try {
          process.kill(pid, name);
        } catch {}
    };
    const found = running();
    // The script stops its servers itself: they're only told when they outlived it, such as after
    // a `kill -9` of the script.
    signal(found.includes(recorded[0]) ? [recorded[0]] : found, "SIGTERM");
    for (let waited = 0; running().length; waited += 100) {
      if (waited === 5000) signal(running(), "SIGKILL");
      await sleep(100);
    }
    rmSync(file, { force: true });
    stopped ||= found.length > 0;
  }
  console.log(stopped ? "Stopped." : "Nothing to stop.");
}

/** Whether something answers on a port of this machine. */
const taken = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, "localhost");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

if (args.includes("--stop")) {
  await stopRunning();
  process.exit(0);
}

for (const port of PORTS)
  if (await taken(port)) {
    console.error(
      `Port ${port} is taken: is another pnpm dev or pnpm preview running? Stop it with pnpm dev:stop.`,
    );
    process.exit(1);
  }
const built = `${site.dist}/client`;
if (preview && !existsSync(`${built}/index.html`)) {
  console.error(`There's no built site to preview: run ${pnpm("build")} first.`);
  process.exit(1);
}

// Two `wrangler dev` started at the same instant can pick the same free port for their own use, and
// one of them fails: the sites' servers start one after the other.
const STARTING = ".wrangler/starting.pid";
/** The process that's starting its servers now, if any; 0 while it's still writing who it is. */
const starting = () => {
  try {
    return Number(readFileSync(STARTING, "utf8"));
  } catch {
    return 0;
  }
};
mkdirSync(".wrangler", { recursive: true });
for (let waited = 0; ; waited += 200) {
  try {
    writeFileSync(STARTING, String(process.pid), { flag: "wx" });
    break;
  } catch {
    // Another one is starting: unless it died before it was done, or a minute passed.
    const other = starting();
    if ((other && !ours(other)) || waited >= 60_000) rmSync(STARTING, { force: true });
    else await sleep(200);
  }
}
const started = () => {
  if (starting() === process.pid) rmSync(STARTING, { force: true });
};

if (args.includes("--fresh")) rmSync(site.state, { recursive: true, force: true });
execFileSync(
  bin("wrangler"),
  ["d1", "migrations", "apply", "skillhub", "--local", "--persist-to", site.state],
  { stdio: "inherit" },
);
// `wrangler dev` wants the assets' directory to exist, built or not.
mkdirSync(built, { recursive: true });

const children: ChildProcess[] = [
  spawn(
    bin("wrangler"),
    [
      "dev",
      "--port",
      String(preview ? site.port : site.workerPort),
      // This site's build and database, which for the real site are wrangler.jsonc's own.
      "--assets",
      built,
      "--persist-to",
      site.state,
      "--var",
      "DEV_LOGIN:1",
      // The Worker sees localhost, rather than skillhub.build from its route.
      "--infer-origin-from-routes=false",
    ],
    { stdio: "inherit" },
  ),
];
if (!preview)
  children.push(
    spawn(bin("vike"), ["dev", "--root", "website", "--port", String(site.port)], {
      stdio: "inherit",
    }),
  );
writeFileSync(PIDS, [process.pid, ...children.map((child) => child.pid)].join("\n"));

/** Stops the servers, each of which stops its own processes, such as wrangler's workerd; then exits. */
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  const running = children.filter((child) => child.exitCode === null && child.signalCode === null);
  const exit = () => {
    rmSync(PIDS, { force: true });
    started();
    process.exit(code);
  };
  if (!running.length) exit();
  let left = running.length;
  for (const child of running) {
    child.once("exit", () => {
      left--;
      if (left === 0) exit();
    });
    child.kill("SIGTERM");
  }
  // One that doesn't stop is killed.
  setTimeout(() => {
    for (const child of running) child.kill("SIGKILL");
    exit();
  }, 5000);
}
// When one stops, stop the other.
for (const child of children) child.on("exit", (code) => stop(code ?? 0));
// Ctrl-C reaches the servers too, as the terminal tells every process; a `kill` only reaches this one.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => stop(0));

/** Whether a URL answers, and well. */
const answers = (url: string) =>
  fetch(url).then(
    (res) => res.ok,
    () => false,
  );
// In dev, the Worker first, on its own port: Vike's dev server logs an error each time it's asked
// for /api/* before the Worker is up. Then through the site, which tells that both are up.
if (!preview)
  while (!(await answers(`http://localhost:${site.workerPort}/api/me`))) await sleep(200);
while (!(await answers(`${SITE}/api/me`))) await sleep(200);
started();
console.log(
  `\nReady: ${SITE}${preview ? ", the built site" : ""}${EDGE_CASES ? ", with the edge cases' catalog" : ""}. Log in logs you in as a test user. Stop it with Ctrl-C, or pnpm dev:stop from elsewhere.\n`,
);
