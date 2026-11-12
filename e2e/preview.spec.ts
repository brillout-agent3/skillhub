/**
 * The skills list's layout, the tags left of the list; its rows, which open wherever clicked; and
 * their previews, which a click on a row opens over the tags on a wide screen (see
 * website/preview-client.ts), where elsewhere it opens the row's page.
 */

import { repo, skill, skillUrl, smallRepo } from "./data.ts";
import { expect, list, open, searchable, settled, test } from "./fixtures.ts";

const preview = (page: import("@playwright/test").Page) => page.locator("#preview");
/** A row's words, beside its numbers, which the preview covers once open. */
const wordsOf = (row: import("@playwright/test").Locator) =>
  row.locator(".skill-body :is(.glance dd, .skill-desc)").first();

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

test("a click on a row previews it over the tags, with its page a click away", async ({ page }) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  // The preview shows the TLDR's prose, which loads after the page.
  await searchable(page);
  const row = list(page).rows.first();
  await expect(row.locator(".skill-name")).toHaveText(skill.name);

  await wordsOf(row).click();
  await expect(preview(page)).toBeVisible();
  await expect(page).toHaveURL(/\?q=/);
  await expect(row).toHaveClass(/previewed/);
  await expect(preview(page).locator("h2")).toHaveText(skill.name);
  for (const { label } of skill.agentReview.tldr?.glance ?? [])
    await expect(preview(page).locator(".glance")).toContainText(`${label}:`);
  const prose = skill.agentReview.tldr?.text;
  if (prose) await expect(preview(page)).toContainText(prose.slice(0, 60));
  await expect(preview(page).locator(".install")).toContainText(`--skill ${skill.name}`);
  // The start of its SKILL.md, from its page.
  await expect(preview(page).locator("[data-skill-md]")).toContainText(
    skill.skillMd ? "Checked daily" : "No copy",
  );
  // Over the window's left side, its whole height, up to the row's words: over the tags, and over
  // the row's numbers. Its words start where the tags do.
  const pane = await preview(page).boundingBox();
  const tags = await page.locator("#facets").boundingBox();
  const name = await preview(page).locator("h2").boundingBox();
  const words = await row.locator(".skill-body").boundingBox();
  const window = page.viewportSize();
  if (!pane || !tags || !name || !words || !window) throw new Error("the preview isn't laid out");
  expect(pane).toMatchObject({ x: 0, y: 0, height: window.height });
  expect(pane.width).toBeLessThan(words.x);
  expect(pane.width).toBeGreaterThan(words.x - 40);
  expect(Math.abs(name.x - tags.x)).toBeLessThan(2);

  // Its × closes it, and the tags under it are back.
  await preview(page).getByRole("button", { name: "Close the preview" }).click();
  await expect(preview(page)).toBeHidden();
  await expect(row).not.toHaveClass(/previewed/);
  const chip = page.locator("#facets .chip").first();
  const tag = await chip.getAttribute("data-tag");
  await chip.click();
  await settled(page);
  await expect(page).toHaveURL(new RegExp(`tag=${encodeURIComponent(tag as string)}`));

  // More details, on the preview as on the row, opens its page.
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  await wordsOf(list(page).rows.first()).click();
  await preview(page).getByRole("link", { name: "More details" }).click();
  await expect(page).toHaveURL(skillUrl);
});

test("a click on another row previews that one, and on the same row, or Escape, closes it", async ({
  page,
}) => {
  // A short list: on the whole one, Playwright's waits on the preview hold up the page.
  await open(page, `/?repo=${encodeURIComponent(repo.repo)}`);
  const { rows } = list(page);
  const names = await rows.locator(".skill-name").allInnerTexts();
  await wordsOf(rows.nth(0)).click();
  await expect(preview(page).locator("h2")).toContainText(names[0]);
  await wordsOf(rows.nth(1)).click();
  await expect(preview(page).locator("h2")).toContainText(names[1]);
  await expect(rows.nth(0)).not.toHaveClass(/previewed/);
  await expect(rows.nth(1)).toHaveClass(/previewed/);
  await wordsOf(rows.nth(1)).click();
  await expect(preview(page)).toBeHidden();
  await wordsOf(rows.nth(1)).click();
  await expect(preview(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview(page)).toBeHidden();
  await expect(rows.nth(1)).not.toHaveClass(/previewed/);
});

test("a row's own buttons, a selection in it, and Ctrl leave its preview closed", async ({
  page,
  context,
}) => {
  await open(page, `/?q=${encodeURIComponent(skill.name)}`);
  // The TLDRs' prose, once in, renders the search's list again, which would undo a selection.
  await searchable(page);
  const row = list(page).rows.first();
  const words = wordsOf(row);

  // Selecting its words, by dragging across them.
  const box = await words.boundingBox();
  if (!box) throw new Error("the row's words aren't laid out");
  await page.mouse.move(box.x + 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 8, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString().length))
    .toBeGreaterThan(0);
  await expect(preview(page)).toBeHidden();
  await page.evaluate(() => getSelection()?.removeAllRanges());

  // With Ctrl or Cmd, its page, in a new tab, as a link.
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    words.click({ modifiers: ["ControlOrMeta"] }),
  ]);
  await expect(tab).toHaveURL(skillUrl);
  await tab.close();
  await expect(preview(page)).toBeHidden();

  // More details, on the row, opens its page.
  await row.getByRole("link", { name: "More details" }).click();
  await expect(page).toHaveURL(skillUrl);
});

test("a repo's rows open their pages", async ({ page }) => {
  await open(page, smallRepo.url);
  const row = page.locator(".skill-list > li").first();
  const href = await row.locator(".skill-name").getAttribute("href");
  await expect(row.locator(".details")).toBeHidden();
  await wordsOf(row).click();
  await expect(page).toHaveURL(href as string);
});

test.describe("in a window 1,100px wide, too narrow for the preview", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("a click on a row opens its page", async ({ page }) => {
    await open(page, `/?q=${encodeURIComponent(skill.name)}`);
    const row = list(page).rows.first();
    await expect(row.locator(".skill-name")).toHaveText(skill.name);
    await expect(row.locator(".details")).toBeHidden();
    await wordsOf(row).click();
    await expect(page).toHaveURL(skillUrl);
  });
});
