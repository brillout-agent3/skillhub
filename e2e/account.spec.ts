/**
 * Logging in and saving. The servers of `pnpm dev` and `pnpm preview` log in as a test user
 * instead of with GitHub: see DEV_LOGIN in worker/index.ts. There's only the one, so these tests
 * run in order, and each starts from nothing saved and nobody logged in.
 */

import type { Page } from "@playwright/test";
import { skill } from "./data.ts";
import { accountLoaded, expect, list, open, ready, settled, test } from "./fixtures.ts";

/** A short list, which the test skill's row heads: see fixtures.ts for why not the whole list. */
const LIST = `/?q=${encodeURIComponent(skill.name)}`;

test.describe.configure({ mode: "default" });

test.beforeEach(async ({ page }) => {
  await page.request.get("/api/auth/login", { maxRedirects: 0 });
  const { saved } = (await (await page.request.get("/api/me")).json()) as { saved: string[] };
  for (const key of saved) await page.request.post("/api/saves", { data: { key, saved: false } });
  await page.request.post("/api/auth/logout", { data: {} });
});

const login = (page: Page) => page.locator("#account a[data-login]");
const logout = (page: Page) => page.locator("#account [data-logout]");
const savedCount = (page: Page) => page.locator("[data-saved-count]");
/** The test skill's row. */
const skillRow = (page: Page) => list(page).rows.first();

/** Opens a page and logs in from its header. */
async function openLoggedIn(page: Page, path: string) {
  await open(page, path);
  await login(page).click();
  await ready(page);
  await expect(logout(page)).toBeVisible();
}

test("Log in comes back to the page you were on, its filters included", async ({ page }) => {
  await openLoggedIn(page, "/?show=bundles");
  await expect(page).toHaveURL("/?show=bundles");
  await expect(page.locator("#account .avatar")).toHaveAttribute("title", "Logged in as test-user");
  await expect(login(page)).toHaveCount(0);
});

test("a save shows on its button, on the Saved switch and in the Saved list", async ({ page }) => {
  await openLoggedIn(page, LIST);
  const { count, rows, empty } = list(page);
  const save = skillRow(page).locator("[data-save]");
  const href = (await skillRow(page).locator(".skill-name").getAttribute("href")) as string;
  await expect(savedCount(page)).toHaveText("");

  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveText("Saved");
  await expect(savedCount(page)).toHaveText("1");

  await page.locator("#saved-switch").click();
  await settled(page);
  await expect(page).toHaveURL(LIST.replace("?", "?saved&"));
  await expect(rows).toHaveCount(1);
  await expect(count).toHaveText("1 skill");
  await expect(rows.locator(".skill-name")).toHaveAttribute("href", href);

  // It's kept by the server: a reload shows it again.
  await page.reload();
  await ready(page);
  await accountLoaded(page);
  await settled(page);
  await expect(rows).toHaveCount(1);
  await expect(savedCount(page)).toHaveText("1");

  // Its own page shows it saved, and unsaves it.
  await open(page, href);
  await accountLoaded(page);
  const onPage = page.locator(".title-row [data-save]");
  await expect(onPage).toHaveAttribute("aria-pressed", "true");
  const unsaved = page.waitForResponse((res) => res.url().endsWith("/api/saves"));
  await onPage.click();
  await expect(onPage).toHaveAttribute("aria-pressed", "false");
  await unsaved;

  await open(page, "/?saved");
  await accountLoaded(page);
  await settled(page);
  await expect(empty).toContainText("Nothing saved yet.");
});

test("a saved bundle counts as a bundle, not as its skills", async ({ page }) => {
  await openLoggedIn(page, "/?show=bundles");
  const save = list(page).rows.first().locator("[data-save]");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(savedCount(page)).toHaveText("1");

  await page.locator('[data-show="all"]').click();
  await page.locator("#saved-switch").click();
  await settled(page);
  await expect(list(page).count).toHaveText("0 skills and 1 bundle");
  await expect(list(page).rows).toHaveCount(1);

  // A search that finds nothing in it counts what you saved the same way.
  await list(page).search.fill("zzzqqqxxx");
  await settled(page);
  await expect(list(page).empty).toContainText(
    "among the 0 skills and 1 bundle the filters leave.",
  );
});

test("the Saved list is empty when what you saved is no longer listed", async ({ page }) => {
  // As a skill whose SKILL.md is gone from its repo: saved once, and off the list since.
  const key = "skill:some/repo/delisted";
  await page.request.get("/api/auth/login", { maxRedirects: 0 });
  await page.request.post("/api/saves", { data: { key, saved: true } });
  await open(page, "/?saved");
  await accountLoaded(page);
  await settled(page);
  await expect(savedCount(page)).toHaveText("");
  await expect(list(page).empty).toContainText("Nothing saved yet.");
  await expect(page.locator("#ask-label")).toContainText("there's nothing to copy");
});

test("Save, logged out, logs you in and saves", async ({ page }) => {
  await open(page, LIST);
  await accountLoaded(page);
  const save = skillRow(page).locator("[data-save]");
  const key = (await save.getAttribute("data-save")) as string;
  await save.click();
  await ready(page);
  await expect(page).toHaveURL(LIST);
  await expect(logout(page)).toBeVisible();
  await expect(page.locator(`[data-save="${key}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(savedCount(page)).toHaveText("1");
});

test("the Saved list, logged out, asks to log in", async ({ page }) => {
  await open(page, "/?saved");
  await accountLoaded(page);
  const { empty } = list(page);
  await expect(empty).toContainText("to see what you saved.");
  // An empty list has no tags: the tags' column says so in a line, not once per facet.
  await expect(page.locator("#tag-facets")).toHaveText("No tags: the list is empty.");
  await empty.getByRole("link", { name: "Log in with GitHub" }).click();
  await ready(page);
  await accountLoaded(page);
  await settled(page);
  await expect(page).toHaveURL("/?saved");
  await expect(empty).toContainText("Nothing saved yet.");
});

test("Log out brings Log in back, and forgets what's saved", async ({ page }) => {
  await openLoggedIn(page, LIST);
  const save = skillRow(page).locator("[data-save]");
  await save.click();
  await expect(savedCount(page)).toHaveText("1");

  await logout(page).focus();
  await page.keyboard.press("Enter");
  await expect(login(page)).toBeVisible();
  // The keyboard is on what took Log out's place, rather than back at the page's top.
  await expect(login(page)).toBeFocused();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await expect(savedCount(page)).toHaveText("");
});

test("the API refuses what isn't a logged-in page's own request", async ({ page }) => {
  const post = (data: unknown, headers?: Record<string, string>) =>
    page.request.post("/api/saves", { data, headers });
  const key = "skill:some/repo/skill";
  expect((await post({ key, saved: true })).status(), "not logged in").toBe(401);

  await page.request.get("/api/auth/login", { maxRedirects: 0 });
  expect((await post({ key, saved: true })).status(), "logged in").toBe(200);
  expect((await post({ key: "skill:../ x", saved: true })).status(), "not an id").toBe(400);
  expect((await post({ key, saved: "yes" })).status(), "not a boolean").toBe(400);
  expect((await post({ key, saved: true }, { "Sec-Fetch-Site": "cross-site" })).status()).toBe(403);
  expect((await post("key=x", { "Content-Type": "text/plain" })).status(), "a form").toBe(403);
  expect((await page.request.get("/api/nope")).status()).toBe(404);
  // A cookie that doesn't decode, as another script may set, doesn't get in the way.
  const odd = await page.request.get("/api/me", { headers: { Cookie: "other=%E0%A4%A" } });
  expect(odd.status(), "an undecodable cookie").toBe(200);

  // Logging in never leads off the site.
  const back = await page.request.get("/api/auth/login?return=//evil.example/", {
    maxRedirects: 0,
  });
  expect(back.headers().location).toBe("/");

  // Nothing stays saved for the test user, whose site may be a `pnpm dev` left running.
  expect((await post({ key, saved: false })).status(), "unsaved").toBe(200);
});
