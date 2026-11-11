/**
 * The end-to-end walk of the site, in e2e/: `pnpm test:e2e`. It runs against whatever serves
 * http://localhost:3000, such as a `pnpm dev` left running, or else builds the site and starts
 * `pnpm preview` itself, as CI does before it deploys (see .github/workflows/deploy.yml).
 * e2e/fixtures.ts says how the tests wait for the pages, and what fails them.
 *
 * e2e/edge-cases.spec.ts walks a second site, the edge cases' (see data/edge-cases.ts), which is
 * found or started the same way, on its own port.
 */

import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { siteOf } from "./data/edge-cases.ts";

/**
 * Claude Code's cloud sessions come with a Chromium of their own, at a version this repo's
 * Playwright may not look for. Elsewhere: `pnpm exec playwright install chromium`, once.
 */
const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  // A test left on `.only` would hide the failures of the others.
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  // Tests run side by side, except account.spec.ts's, which share the one test user.
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${siteOf(false).port}`,
    viewport: { width: 1440, height: 900 },
    // For Find with your agent and the Copy buttons.
    permissions: ["clipboard-read", "clipboard-write"],
    // Recording every test costs a third of the run: turn it on to debug one, with --trace on.
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: existsSync(CLOUD_CHROMIUM) ? { executablePath: CLOUD_CHROMIUM } : {},
  },
  // One after the other: the second starts once the first answers.
  webServer: [server(false), server(true)],
});

/** What serves a site, the real one or the edge cases': its port's server, or else its build, previewed. */
function server(edgeCases: boolean) {
  return {
    // CI has just built the site. Elsewhere the build could be stale, or missing.
    command: process.env.CI ? "pnpm preview" : "pnpm build && pnpm preview",
    // Which of the two sites the commands are about, whatever the walk itself was started with.
    env: { SKILLHUB_DATA: edgeCases ? "edge-cases" : "" },
    // The Worker answers through the site: both are up.
    url: `http://localhost:${siteOf(edgeCases).port}/api/me`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  };
}
