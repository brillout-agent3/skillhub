/** The skills list: its search, its settings and its tags, which all live in the URL. */

import type { Page, Route } from "@playwright/test";
import { data, listedRows, repo, skill } from "./data.ts";
import {
  expect,
  fromCompact,
  list,
  n,
  open,
  ready,
  searchable,
  settled,
  test,
} from "./fixtures.ts";

const all = `${n(data.skills.length)} skills`;

test("opens on Rising, with every skill counted and every row in", async ({ page }) => {
  await open(page, "/");
  const { count, rows } = list(page);
  await expect(count).toHaveText(all);
  await expect(rows).toHaveCount(listedRows);
  await expect(page.locator('[data-preset="rising"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sort")).toContainText("Weekly Growth");
});

test("the search narrows the list as you type, best match first", async ({ page }) => {
  await open(page, "/");
  await searchable(page);
  const { count, rows, search } = list(page);
  await search.fill(skill.name);
  await settled(page);
  await expect(page).toHaveURL(`/?q=${encodeURIComponent(skill.name)}`);
  await expect(rows.first().locator(".skill-name")).toHaveText(skill.name);
  await expect(page.locator("#sort")).toContainText("Best match");
  await expect(count).not.toHaveText(all);
  // What the list shows is what the lines under the boxes count.
  const found = (await count.innerText()).split(" ")[0];
  await expect(page.locator("#search-note")).toContainText(`Filters ${found} skill`);

  await search.fill("");
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(count).toHaveText(all);
  await expect(page.locator("#sort")).toContainText("Weekly Growth");

  // Spaces alone aren't a search: the list keeps its order.
  await search.fill("  ");
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(page.locator("#sort")).toContainText("Weekly Growth");
});

test("a search that finds nothing says so, and offers the agent", async ({ page }) => {
  await open(page, "/");
  const { count, empty, search } = list(page);
  await search.fill("zzzqqqxxx");
  await settled(page);
  await expect(count).toHaveText("0 skills");
  await expect(empty).toContainText("No skill or bundle matches “zzzqqqxxx”");

  // The agent gets the search as the need, and the skills it would have looked through.
  await expect(page.locator("#ask-label")).toContainText(`of all ${n(data.skills.length)} skills.`);
  await empty.locator('[data-action="ask"]').click();
  await expect(page.locator("#ask-label")).toContainText("Copied to your clipboard");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`# Catalog (${listedRows} entries)`);
  expect(prompt.trimEnd().endsWith("zzzqqqxxx")).toBe(true);
});

test("the presets set the sort and the Published range", async ({ page }) => {
  await open(page, "/");
  const preset = (id: string) => page.locator(`[data-preset="${id}"]`);

  await preset("top").click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=week");
  await expect(preset("top")).toHaveAttribute("aria-pressed", "true");
  await expect(preset("rising")).toHaveAttribute("aria-pressed", "false");
  const weeks = (await list(page).sortedValues.allInnerTexts()).slice(0, 30).map(fromCompact);
  expect(weeks).toEqual(weeks.toSorted((a, b) => b - a));

  await preset("rising-new").click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=week&published=90d..");
  await expect(page.locator('[data-range-label="published"]').first()).toHaveText("Last 90 days");
  await expect(list(page).scope).toContainText("Published: Last 90 days");

  await preset("new").click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=published");

  await preset("rising").click();
  await settled(page);
  await expect(page).toHaveURL("/");
});

test("the Sort by menu works with the mouse and with the keyboard", async ({ page }) => {
  await open(page, "/");
  const button = page.locator("#sort");
  const options = page.locator("#sort-options");

  await button.click();
  await expect(options).toBeVisible();
  await options.locator('[data-sort="stars"]').click();
  await settled(page);
  await expect(options).toBeHidden();
  await expect(page).toHaveURL("/?sort=stars");
  await expect(button).toContainText("Stars");

  await page.locator('[data-order="asc"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?sort=stars&order=asc");
  const stars = (await list(page).sortedValues.allInnerTexts()).slice(0, 30).map(fromCompact);
  expect(stars).toEqual(stars.toSorted((a, b) => a - b));

  // Arrow keys open it on the current sort and move among the options; Escape hands the focus back.
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.locator('[data-sort="stars"]')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(options.locator('[role="option"]').first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(button).toBeFocused();

  // Enter picks: the last option is Weekly Growth, the default, so the URL drops the sort.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(page).toHaveURL("/?order=asc");
  await expect(button).toBeFocused();
});

test("a number filter narrows the list from its popover", async ({ page }) => {
  await open(page, "/");
  const { count, scope } = list(page);
  const pill = page.locator('.range-pill[data-value="stars"]');
  const pop = page.locator("#range-pop-stars");

  await pill.click();
  await expect(pop).toBeVisible();
  await expect(pill).toHaveAttribute("aria-expanded", "true");
  await pop.locator('input[data-end="0"]').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await settled(page);
  await expect(page).toHaveURL(/\/\?stars=\d+\.\.$/);
  const label = await page.locator('[data-range-label="stars"]').first().innerText();
  expect(label).toMatch(/^≥ /);
  await expect(scope).toContainText(`Stars: ${label}`);
  expect(Number.parseInt((await count.innerText()).replace(/,/g, ""))).toBeLessThan(
    data.skills.length,
  );

  // Escape closes the popover and hands the focus back to its pill.
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await expect(pill).toBeFocused();
  // So does a click elsewhere.
  await pill.click();
  await expect(pop).toBeVisible();
  await page.locator("h1").click();
  await expect(pop).toBeHidden();

  await scope.locator('[data-remove="range"]').click();
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(count).toHaveText(all);
});

test("a number filter's slider stays where it is while it narrows the list", async ({ page }) => {
  await open(page, "/");
  const pill = page.locator('.range-pill[data-value="stars"]');
  const left = async () => Math.round((await pill.boundingBox())?.x ?? Number.NaN);
  await pill.click();
  const before = await left();
  await page.locator('#range-pop-stars input[data-end="0"]').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await settled(page);
  // Its pill got longer, for its range, and Rising isn't pressed anymore: neither moved it.
  await expect(pill).toContainText("≥");
  await expect(page.locator('[data-preset="rising"]')).toHaveAttribute("aria-pressed", "false");
  expect(await left()).toBe(before);
});

test("the Sort by button fits each sort's name, at one width", async ({ page }) => {
  await open(page, "/?show=bundles");
  const button = page.locator("#sort");
  const width = async () => (await button.boundingBox())?.width;
  const first = await width();
  for (const sort of ["published", "stars", "downloads", "week"]) {
    await button.click();
    await page.locator(`#sort-options [data-sort="${sort}"]`).click();
    await settled(page);
    expect(await button.evaluate((b) => b.scrollWidth <= b.clientWidth), sort).toBe(true);
    expect(await width(), sort).toBe(first);
  }
});

test("Find with your agent says so when the browser refuses the clipboard", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("refused"));
  });
  await open(page, "/?show=bundles");
  await page.locator(".ask-button").click();
  await expect(page.locator("#ask-label")).toContainText(
    "didn't let the prompt onto your clipboard",
  );
});

test("Show switches between skills, bundles and both", async ({ page }) => {
  await open(page, "/");
  const { count, rows } = list(page);

  await page.locator('[data-show="bundles"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?show=bundles");
  await expect(count).toHaveText(`${n(data.bundles.length)} bundles`);
  await expect(rows).toHaveCount(data.bundles.length);

  // Every skill on a row of its own, those only listed inside a bundle included.
  await page.locator('[data-show="skills"]').click();
  await settled(page);
  await expect(page).toHaveURL("/?show=skills");
  await expect(count).toHaveText(all);
  await expect(rows).toHaveCount(data.skills.length);

  await page.locator('[data-show="all"]').click();
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(rows).toHaveCount(listedRows);
});

test("a tag narrows the list to as many skills as it says", async ({ page }) => {
  await open(page, "/");
  const { count, rows, scope } = list(page);
  const first = page.locator("#facets .chip[data-tag]").first();
  const tag = (await first.getAttribute("data-tag")) as string;
  const chip = page.locator(`#facets .chip[data-tag="${tag}"]`);
  const says = Number(await chip.locator(".n").innerText());

  await chip.click();
  await settled(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(tag)}`);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText(`${n(says)} skills`);
  await expect(scope.locator('[data-remove="tag"]')).toHaveCount(1);

  // A row's own tag joins the filters.
  await rows.first().locator("button.tag").first().click();
  await settled(page);
  await expect(scope.locator('[data-remove="tag"]')).toHaveCount(2);

  await scope.locator('[data-action="clear"]').click();
  await settled(page);
  await expect(page).toHaveURL("/");
  await expect(count).toHaveText(all);
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});

test("a link holds the whole view, and a reload shows it again", async ({ page }) => {
  await open(page, "/?q=design&tag=type%3Aworkflow&sort=stars&order=asc&stars=100..&show=skills");
  await searchable(page);
  const { count, search } = list(page);
  const shows = async () => {
    await expect(search).toHaveValue("design");
    await expect(page.locator('#facets .chip[data-tag="type:workflow"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#sort")).toContainText("Stars");
    await expect(page.locator('[data-order="asc"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-range-label="stars"]').first()).toHaveText("≥ 100");
    await expect(page.locator('[data-show="skills"]')).toHaveAttribute("aria-pressed", "true");
  };
  await shows();
  const before = await count.innerText();
  expect(before).not.toBe(all);

  await page.reload();
  await ready(page);
  await searchable(page);
  await shows();
  await expect(count).toHaveText(before);
});

test("a repo's link lists that repo's skills, under its banner", async ({ page }) => {
  await open(page, `/?repo=${encodeURIComponent(repo.repo)}&show=skills`);
  const { count, rows, scope } = list(page);
  await expect(page.locator(".repo-banner")).toContainText(repo.repo);
  await expect(rows).toHaveCount(repo.skills.length);
  await expect(count).toHaveText(`${n(repo.skills.length)} skills`);
  await expect(scope.locator('[data-remove="repo"]')).toContainText(`from ${repo.repo}`);
});

test("going back to a list returns to where you were in it", async ({ page }) => {
  await open(page, "/?sort=week");
  const link = list(page).rows.nth(200).locator(".skill-name");
  const href = (await link.getAttribute("href")) as string;
  // A person scrolls, then clicks: the browser notes where the page is scrolled to once it has
  // drawn it there, which a click in the same instant, as Playwright's own scroll is, comes before.
  await link.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((drawn) => requestAnimationFrame(() => setTimeout(drawn))));
  await link.click();
  await ready(page);
  await expect(page).toHaveURL(href);

  await page.goBack();
  await ready(page);
  await expect(page.locator(`#results .skill-name[href="${href}"]`).first()).toBeInViewport();
});

test.describe("until the list's script has run, as on a slow connection", () => {
  /** Holds the page's scripts back until the returned function is called. */
  async function holdScripts(page: Page) {
    const held: Route[] = [];
    let released = false;
    await page.route("**/*", (route) => {
      if (released || route.request().resourceType() !== "script") return route.continue();
      held.push(route);
    });
    return async () => {
      released = true;
      await Promise.all(held.map((route) => route.continue()));
    };
  }

  test("a link to another list doesn't show the unfiltered one", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto(`/?q=${encodeURIComponent(skill.name)}&show=skills`, { waitUntil: "commit" });
    const { rows, search } = list(page);
    await expect(search).toHaveValue(skill.name);
    await expect(page.locator("html[data-pending]")).toHaveCount(1);
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator("#settings")).toBeHidden();

    await release();
    await ready(page);
    await expect(page.locator("html[data-pending]")).toHaveCount(0);
    await expect(page.locator("#results")).toBeVisible();
    await expect(rows.first().locator(".skill-name")).toHaveText(skill.name);
  });

  test("a search typed meanwhile is searched for", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto("/", { waitUntil: "commit" });
    const { rows, search } = list(page);
    await search.fill(skill.name);

    await release();
    await ready(page);
    await expect(page).toHaveURL(`/?q=${encodeURIComponent(skill.name)}`);
    await expect(search).toHaveValue(skill.name);
    await expect(rows.first().locator(".skill-name")).toHaveText(skill.name);
  });
});

test("Find with your agent copies a prompt with the list and the need", async ({ page }) => {
  await open(page, "/?tag=type%3Aworkflow&show=bundles");
  const rows = await list(page).rows.count();
  await page.locator("#need").fill("review my pull requests");
  await page.locator(".ask-button").click();
  await expect(page.locator("#ask-label")).toContainText("Copied to your clipboard");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`# Catalog (${rows} entries)`);
  expect(prompt).toContain("narrowed to: tag type:workflow");
  expect(prompt.trimEnd().endsWith("review my pull requests")).toBe(true);
});
