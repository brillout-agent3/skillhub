/** On a phone: nothing wider than the screen, and the list's settings and tags behind their buttons. */

import { bundleUrl, longLabelUrl, longWordUrl, owner, repo, skillUrl } from "./data.ts";
import { expect, open, test } from "./fixtures.ts";

const WIDTH = 390;
test.use({ viewport: { width: WIDTH, height: 844 }, isMobile: true, hasTouch: true });

for (const [name, url] of [
  ["the skills list", "/"],
  ["a filtered list", "/?q=design&tag=type%3Aworkflow&stars=100..&show=bundles"],
  ["a skill's page", skillUrl],
  // What's hardest to fit: a label as long as another skill's name, and a word as long as a file's.
  ["a skill's page whose glance has a long label", longLabelUrl],
  ["a skill's page whose glance has a long word", longWordUrl],
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

test("a glance's facts keep most of the line, however long a label is", async ({ page }) => {
  await open(page, longLabelUrl);
  const [glance, text] = await page
    .locator(".at-a-glance .glance")
    .evaluate((dl) => [
      dl.getBoundingClientRect().width,
      (dl.querySelector("dd") as Element).getBoundingClientRect().width,
    ]);
  expect(text).toBeGreaterThan(glance / 2);
});

test("a trend's tooltip stays on the screen, at its last week too", async ({ page }) => {
  await open(page, skillUrl);
  const spark = page.locator(".spark");
  await spark.scrollIntoViewIfNeeded();
  const box = (await spark.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // The last week is at the chart's right end, by the screen's edge.
  await page.touchscreen.tap(box.x + box.width - 3, box.y + box.height / 2);
  const tip = page.locator(".spark-tip");
  await expect(tip).toBeVisible();
  expect(await tip.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(WIDTH);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(WIDTH);
});

test("a label of the about page's table, too long for its line, goes on under its own start", async ({
  page,
}) => {
  await open(page, "/about/");
  // Where each line of a label starts, for the labels that take more than one.
  const starts = await page.locator(".breakdown td:first-child").evaluateAll((cells) =>
    cells
      .map((cell) => {
        const label = [...cell.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!label) return [];
        const range = document.createRange();
        range.selectNodeContents(label);
        return [...range.getClientRects()].map((line) => Math.round(line.left));
      })
      .filter((lines) => lines.length > 1),
  );
  expect(starts).not.toHaveLength(0);
  // Not under the row's emoji, which comes before the label's first line.
  for (const lines of starts) expect(new Set(lines).size, lines.join(", ")).toBe(1);
});

test("a repo's numbers break between two of them, not inside one", async ({ page }) => {
  await open(page, repo.url);
  const facts = page.locator(".listing-page > .muted .fact");
  await expect(facts).not.toHaveCount(0);
  // Each on one line: none is wider than the screen.
  const broken = await facts.evaluateAll(
    (all) =>
      all.filter(
        (fact) =>
          fact.getBoundingClientRect().height >
          1.5 * Number.parseFloat(getComputedStyle(fact).lineHeight),
      ).length,
  );
  expect(broken).toBe(0);
});

test("a number filter's slider opens in view", async ({ page }) => {
  await open(page, "/?show=bundles");
  await page.locator(".filters-toggle").click();
  await page.locator('.range-pill[data-value="week"]').click();
  await expect(page.locator("#range-pop-week")).toBeInViewport({ ratio: 1 });
});

test("the agent's button is under its box, as wide as it", async ({ page }) => {
  await open(page, "/?show=bundles");
  const box = async (selector: string) =>
    (await page.locator(selector).boundingBox()) as { y: number; width: number; height: number };
  const [need, button, field] = [
    await box("#need"),
    await box(".ask-button"),
    await box(".agent-field"),
  ];
  expect(button.y).toBeGreaterThanOrEqual(need.y + need.height);
  expect(button.width).toBeGreaterThan(field.width * 0.9);
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

test.describe("on a small phone, 360px wide", () => {
  const SMALL = 360;
  test.use({ viewport: { width: SMALL, height: 740 } });

  test("the filters' pills fit the screen, however long their ranges", async ({ page }) => {
    // Every filter narrowed, and Age at its longest, which doesn't fit half a row: its pill takes
    // a row of its own, rather than push the others off the screen.
    await open(
      page,
      "/?show=bundles&published=90d..30d&stars=1000..50000&downloads=1000..100000&week=100..5000",
    );
    await page.locator(".filters-toggle").click();
    const pills = page.locator(".range-pill");
    await expect(pills.first()).toContainText("1 month – 3 months");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(SMALL);
    // Nor do a pill's words stick out of it.
    expect(
      await pills.evaluateAll((all) => all.filter((pill) => pill.scrollWidth > pill.clientWidth)),
    ).toHaveLength(0);
  });
});
