/** Every page besides the skills list, and the header they share. */

import {
  anchorsUrl,
  bundle,
  bundleUrl,
  data,
  owner,
  repo,
  skill,
  skillUrl,
  wideCodeUrl,
} from "./data.ts";
import { expect, list, n, open, ready, test } from "./fixtures.ts";

const clipboard = (page: import("@playwright/test").Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test("a skill's page: its name, numbers, install command and SKILL.md", async ({ page }) => {
  await open(page, skillUrl);
  await expect(page).toHaveTitle(`${skill.name} · SkillHub`);
  await expect(page.locator("h1")).toHaveText(skill.name);
  const [ownerName, repoName] = skill.id.split("/");
  await expect(page.locator(".crumbs a")).toHaveText(["Skills", ownerName, repoName]);

  // The install command is copied as shown.
  const command = `npx skills add https://github.com/${ownerName}/${repoName} --skill ${skill.name}`;
  await expect(page.locator(".install code")).toHaveText(command);
  await page.locator(".install .copy").click();
  await expect(page.locator(".install .copy[data-copied]")).toBeVisible();
  expect(await clipboard(page)).toBe(command);

  // The sparkline reads out each week with the keyboard.
  const weekly = skill["skills.sh"].weeklyInstalls as number[];
  await page.locator(".spark").focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".spark-tip")).toContainText(`${n(weekly[0])} installs`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".spark-tip")).toContainText(`${n(weekly[1])} installs`);

  await expect(page.locator(".skill-md .markdown")).not.toBeEmpty();

  // A tag leads to the list, filtered by it.
  const tag = page.locator(".tag-detail a.tag").first();
  const name = (await tag.getAttribute("data-tag")) as string;
  await tag.click();
  await ready(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(name)}`);
  await expect(list(page).scope.locator('[data-remove="tag"]')).toHaveCount(1);
});

test("a SKILL.md's links to its own headings lead to them", async ({ page }) => {
  await open(page, anchorsUrl);
  const link = page.locator('.markdown a[href^="#md-"]').first();
  const href = (await link.getAttribute("href")) as string;
  await link.click();
  await expect(page).toHaveURL(`${anchorsUrl}${href}`);
  await expect(page.locator(`[id="${href.slice(1)}"]`)).toBeInViewport();
});

test("the keyboard reaches a SKILL.md's blocks that scroll sideways, and only those", async ({
  page,
}) => {
  await open(page, wideCodeUrl);
  const blocks = page.locator(".markdown pre, .markdown table");
  await expect(page.locator('.markdown pre[tabindex="0"]')).not.toHaveCount(0);
  const mismatched = await blocks.evaluateAll(
    (all) => all.filter((b) => b.scrollWidth > b.clientWidth !== (b.tabIndex === 0)).length,
  );
  expect(mismatched).toBe(0);
});

test("a bundle's page: its skills in order, and how to install them", async ({ page }) => {
  const { name, skills, install } = bundle.agentReview;
  await open(page, bundleUrl);
  await expect(page).toHaveTitle(`${name} · SkillHub`);
  await expect(page.locator("h1")).toContainText(name);
  await expect(page.locator("h1 .kind")).toHaveText(`Bundle of ${skills.length} skills`);
  const names = skills.map(({ id }) => data.skills.find((s) => s.id === id)?.name ?? "");
  await expect(page.locator(".bundle-skills .skill-name")).toHaveText(names);

  await expect(page.locator(".install")).toHaveCount(install.length);
  await page.locator(".install .copy").first().click();
  expect(await clipboard(page)).toBe(install[0].command);

  // Its trend reads out each week with the keyboard, as a skill's does.
  await page.locator(".spark").focus();
  await expect(page.locator(".spark-tip")).toBeVisible();
});

test("a repo's page lists its bundles and skills, and leads to the list", async ({ page }) => {
  await open(page, repo.url);
  await expect(page.locator("h1")).toContainText(repo.repo.split("/")[1]);
  await expect(page.locator(".skill-list > li")).toHaveCount(
    repo.bundles.length + repo.skills.length,
  );
  await page.getByRole("link", { name: "Sort and filter them in the skills list" }).click();
  await ready(page);
  await expect(page).toHaveURL(`/?repo=${encodeURIComponent(repo.repo)}`);
  await expect(page.locator(".repo-banner")).toContainText(repo.repo);
});

test("an owner's page lists every repo of theirs", async ({ page }) => {
  await open(page, owner.url);
  await expect(page.locator("h1")).toHaveText(new RegExp(`^${owner.url.slice(1, -1)}$`, "i"));
  await expect(page.locator("main section")).toHaveCount(owner.repos);
  await expect(page.locator(".skill-list > li")).toHaveCount(owner.rows);
});

test("the tags page: its search narrows it, and a tag leads to the list", async ({ page }) => {
  await open(page, "/tags/");
  const input = page.locator("#tag-q");
  const sections = page.locator(".facet-doc");
  const all = await sections.count();

  await input.fill("security");
  const shown = page.locator(".tag-table tbody tr:visible, .cloud-item:visible");
  await expect(shown).not.toHaveCount(0);
  for (const text of await shown.allInnerTexts()) expect(text.toLowerCase()).toContain("security");
  expect(await sections.filter({ visible: true }).count()).toBeLessThan(all);

  await input.fill("zzzqqq");
  await expect(page.locator("#tag-none")).toHaveText("No tag matches “zzzqqq”.");
  await expect(sections.filter({ visible: true })).toHaveCount(0);

  await input.fill("");
  await expect(sections.filter({ visible: true })).toHaveCount(all);
  await expect(page.locator("#tag-none")).toBeHidden();

  const tag = page.locator(".tag-table a.tag").first();
  const name = (await tag.getAttribute("data-tag")) as string;
  await tag.click();
  await ready(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(name)}`);
});

test("the about page counts what the site lists, and explains each row", async ({ page }) => {
  await open(page, "/about/");
  const listed = page.locator(".breakdown tbody tr").first();
  await expect(listed.locator(".num")).toContainText(n(data.skills.length));
  await expect(page.locator(".lede")).toContainText(n(data.skills.length));

  // A click pins a row's explanation open; Escape closes it.
  const tip = listed.locator(".tip-text");
  await expect(tip).toBeHidden();
  await listed.locator(".tip-i").click();
  await page.mouse.move(0, 0);
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test.describe("a page that doesn't exist", () => {
  test.use({ expected: /\b404\b/ });

  test("says so, and leads back to the skills", async ({ page }) => {
    const response = await page.goto("/no-such-page/");
    expect(response?.status()).toBe(404);
    await ready(page);
    await expect(page.locator("h1")).toHaveText("Page not found");
    await page.locator("main a").click();
    await ready(page);
    await expect(page).toHaveURL("/");
  });
});

test("the header leads to every page, and marks the one you're on", async ({ page }) => {
  await open(page, "/");
  const nav = page.locator(".site-links");
  for (const [name, url] of [
    ["Tags", "/tags/"],
    ["About", "/about/"],
  ]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await ready(page);
    await expect(page).toHaveURL(url);
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await expect(nav.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/brillout/skillhub",
  );
  await page.locator(".brand").click();
  await ready(page);
  await expect(page).toHaveURL("/");
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("follows the system until the toggle says otherwise, which a reload keeps", async ({
    page,
  }) => {
    await open(page, "/about/");
    const html = page.locator("html");
    const toggle = page.locator("[data-theme-toggle]");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await ready(page);
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});
