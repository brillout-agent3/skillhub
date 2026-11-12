/**
 * The skills list's layout, the tags left of the list; its rows, which open their pages wherever
 * clicked; and their previews, which resting the pointer on a row's words opens over the tags (see
 * website/preview-client.ts).
 */

import { repo, skill, skillUrl, smallRepo } from "./data.ts";
import { expect, list, open, searchable, settled, test } from "./fixtures.ts";

const preview = (page: import("@playwright/test").Page) => page.locator("#preview");

test("the tags are left of the list, the settings' line as wide as both", async ({ page }) => {
  await open(page, "/");
  const tags = await page.locator("#facets").boundingBox();
  const results = await page.locator("#results").boundingBox();
  const settings = await page.locator("#settings").boundingBox();
  if (!tags || !results || !settings) throw new Error("the list's view isn't laid out");
  expect(tags.x + tags.width).toBeLessThan(results.x);
  expect(Math.abs(settings.x - tags.x)).toBeLessThan(2);
  expect(Math.abs(settings.x + settings.width - (results.x + results.width))).toBeLessThan(2);
});

test("a row opens its page wherever it's clicked, but not where its words are selected", async ({
  page,
  context,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  // The TLDRs' prose, once in, renders the search's list again, which would undo a selection.
  await searchable(page);
  const row = list(page).rows.first();
  await expect(row.locator(".skill-name")).toHaveText(skill.name);
  const words = row.locator(".skill-body :is(.glance dd, .skill-desc)").first();

  // Selecting its words, by dragging across them, leaves the page where it is.
  const box = await words.boundingBox();
  if (!box) throw new Error("the row's words aren't laid out");
  await page.mouse.move(box.x + 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 8, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString().length))
    .toBeGreaterThan(0);
  await expect(page).toHaveURL(/\?q=/);
  await page.evaluate(() => getSelection()?.removeAllRanges());

  // With Ctrl or Cmd, in a new tab, as a link.
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    words.click({ modifiers: ["ControlOrMeta"] }),
  ]);
  await expect(tab).toHaveURL(skillUrl);
  await tab.close();
  await expect(page).toHaveURL(/\?q=/);

  await row.locator(".props").click();
  await expect(page).toHaveURL(skillUrl);
});

test("a repo's rows open their pages too", async ({ page }) => {
  await open(page, smallRepo.url);
  const row = page.locator(".skill-list > li").first();
  const href = await row.locator(".skill-name").getAttribute("href");
  await row.locator(".skill-body :is(.glance dd, .skill-desc)").first().click();
  await expect(page).toHaveURL(href as string);
});

test("resting the pointer on a row's words previews it over the tags, which stay clickable", async ({
  page,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  // The preview shows the TLDR's prose, which loads after the page.
  await searchable(page);
  const row = list(page).rows.first();
  await expect(row.locator(".skill-name")).toHaveText(skill.name);

  await row.locator(".skill-body").hover();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator("h2")).toHaveText(skill.name);
  for (const { label } of skill.agentReview.tldr?.glance ?? [])
    await expect(preview(page).locator(".glance")).toContainText(`${label}:`);
  const prose = skill.agentReview.tldr?.text;
  if (prose) await expect(preview(page)).toContainText(prose.slice(0, 60));
  // The start of its SKILL.md, from its page.
  await expect(preview(page).locator("[data-skill-md]")).toContainText(
    skill.skillMd ? "Checked daily" : "No copy",
  );
  // Over the tags, and over the row's numbers, up to its words.
  const pane = await preview(page).boundingBox();
  const tags = await page.locator("#facets").boundingBox();
  const words = await row.locator(".skill-body").boundingBox();
  if (!pane || !tags || !words) throw new Error("the preview isn't laid out");
  expect(Math.abs(pane.x - tags.x)).toBeLessThan(2);
  expect(pane.x + pane.width).toBeLessThan(words.x);
  expect(pane.x + pane.width).toBeGreaterThan(words.x - 40);

  // A tag under it takes the click, which closes it, as the list it was about goes.
  const chip = page.locator("#facets .chip").first();
  const tag = await chip.getAttribute("data-tag");
  await chip.click();
  await settled(page);
  await expect(page).toHaveURL(new RegExp(`tag=${encodeURIComponent(tag as string)}`));
  await expect(preview(page)).toBeHidden();
});

test("the preview follows the pointer down the list, and Escape closes it", async ({ page }) => {
  // A short list: on the whole one, Playwright's waits on the preview hold up the page.
  await open(page, `/?repo=${encodeURIComponent(repo.repo)}`);
  const { rows } = list(page);
  await rows.nth(0).locator(".skill-body").hover();
  await expect(preview(page).locator("h2")).toContainText(
    await rows.nth(0).locator(".skill-name").innerText(),
  );
  await rows.nth(1).locator(".skill-body").hover();
  await expect(preview(page).locator("h2")).toContainText(
    await rows.nth(1).locator(".skill-name").innerText(),
  );
  await expect(rows.nth(1)).toHaveClass(/previewed/);
  await page.keyboard.press("Escape");
  await expect(preview(page)).toBeHidden();
  await expect(rows.nth(1)).not.toHaveClass(/previewed/);
});
