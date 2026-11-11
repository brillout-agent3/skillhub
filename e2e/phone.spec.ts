/** On a phone: nothing wider than the screen, and the list's settings and tags behind their buttons. */

import { bundleUrl, owner, repo, skillUrl } from "./data.ts";
import { expect, open, test } from "./fixtures.ts";

const WIDTH = 390;
test.use({ viewport: { width: WIDTH, height: 844 }, isMobile: true, hasTouch: true });

for (const [name, url] of [
  ["the skills list", "/"],
  ["a filtered list", "/?q=design&tag=type%3Aworkflow&stars=100..&show=bundles"],
  ["a skill's page", skillUrl],
  ["a bundle's page", bundleUrl],
  ["a repo's page", repo.url],
  ["an owner's page", owner.url],
  ["the tags page", "/tags/"],
  ["the about page", "/about/"],
])
  test(`${name} fits the screen's width`, async ({ page }) => {
    await open(page, url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(WIDTH);
  });

test("a number filter's slider opens in view", async ({ page }) => {
  await open(page, "/?show=bundles");
  await page.locator(".filters-toggle").click();
  await page.locator('.range-pill[data-value="week"]').click();
  await expect(page.locator("#range-pop-week")).toBeInViewport({ ratio: 1 });
});

test("the list's settings and tags open from their buttons", async ({ page }) => {
  await open(page, "/");
  const settings = page.locator("#sort-group");
  const tags = page.locator("#tag-facets");
  const filters = page.locator(".filters-toggle");
  const tagsToggle = page.locator(".tags-toggle");

  // The presets and the Saved switch stay in view.
  await expect(page.locator("#presets")).toBeVisible();
  await expect(page.locator("#saved-switch")).toBeVisible();
  await expect(settings).toBeHidden();
  await expect(tags).toBeHidden();

  await filters.click();
  await expect(settings).toBeVisible();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await expect(filters).toHaveText("Hide filters");
  await filters.click();
  await expect(settings).toBeHidden();

  await tagsToggle.click();
  await expect(tags).toBeVisible();
  await expect(tagsToggle).toHaveAttribute("aria-expanded", "true");
  await tagsToggle.click();
  await expect(tags).toBeHidden();
});
