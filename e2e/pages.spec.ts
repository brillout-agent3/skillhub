/** Every page besides the skills list, and the header they share. */

import {
  anchorsUrl,
  bundle,
  bundleUrl,
  data,
  flagsBundleUrl,
  owner,
  repo,
  skill,
  skillUrl,
  stackTags,
  wideCodeUrl,
} from "./data.ts";
import { bundlePage } from "../website/github.ts";
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
  await expect(page.locator(".spark-tip")).toContainText(`${n(weekly[0])} downloads`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".spark-tip")).toContainText(`${n(weekly[1])} downloads`);

  await expect(page.locator(".skill-md .markdown")).not.toBeEmpty();

  // A tag leads to the list, filtered by it.
  const tag = page.locator(".tag-detail a.tag").first();
  const name = (await tag.getAttribute("data-tag")) as string;
  await tag.click();
  await ready(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(name)}`);
  await expect(list(page).scope.locator('[data-remove="tag"]')).toHaveCount(1);
});

test("a skill's numbers are level from one tile to the one beside it", async ({ page }) => {
  await open(page, skillUrl);
  // Two tiles a row: Weekly Downloads, whose trend is on its number's own line, then Total
  // Downloads. Taller than the number, the trend pushed it, and what's under it, down.
  await expect(page.locator(".stat-tiles .stat").first().locator(".trend")).toBeVisible();
  for (const part of [".stat-value", ".stat-standing", ".crowd"]) {
    const [weekly, total] = await page
      .locator(`.stat-tiles ${part}`)
      .evaluateAll((all) => all.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(weekly, part).toBe(total);
  }
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

test("where an install command wraps, a flag stays with what it's set to", async ({ page }) => {
  await open(page, flagsBundleUrl);
  const pairs = page.locator(".install code .pair");
  await expect(pairs).not.toHaveCount(0);
  // Each on one line, unless it's wider than a line by itself: the command is in a font whose
  // letters are all as wide, so a pair is as wide as its letters.
  const parted = await pairs.evaluateAll(
    (all) =>
      all.filter((pair) => {
        const code = pair.closest("code") as HTMLElement;
        const style = getComputedStyle(code);
        const room =
          code.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight);
        const words = [...pair.querySelectorAll(".word")].map((word) =>
          word.getBoundingClientRect(),
        );
        const letter = words[0].width / (pair.querySelector(".word")?.textContent ?? " ").length;
        const lines = new Set(words.map((word) => Math.round(word.top))).size;
        return lines > 1 && (pair.textContent ?? "").length * letter <= room;
      }).length,
  );
  expect(parted).toBe(0);
});

test("a bundle's page says which of its skills work alone: all, some or none", async ({ page }) => {
  const alone = (b: typeof bundle) => b.agentReview.skills.filter((m) => m.standalone).length;
  const kinds: [said: string, is: (b: typeof bundle) => boolean][] = [
    ["Each also works alone.", (b) => alone(b) === b.agentReview.skills.length],
    ["None works alone: each needs the rest of the bundle.", (b) => alone(b) === 0],
    ["The others also work alone.", (b) => alone(b) > 0 && alone(b) < b.agentReview.skills.length],
  ];
  for (const [said, is] of kinds) {
    // The data may have no bundle of a kind, on some day.
    const found = data.bundles.find(is);
    if (!found) continue;
    await open(page, `/${bundlePage(found)}/`);
    await expect(page.locator("#skills + p")).toContainText(said);
    await expect(page.locator(".bundle-skills .kind")).toHaveCount(
      found.agentReview.skills.length - alone(found),
    );
  }
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
  // After each facet's question, how many of its tags a skill has, as a sentence of its own.
  const counts = await page.locator(".question .muted").allTextContents();
  expect(counts).toHaveLength(all);
  for (const count of counts) expect(count).toMatch(/^[A-Z][a-z ]+ per skill\.$/);

  await input.fill("security");
  const shown = page.locator(".tag-table tbody tr:visible, .cloud-item:visible");
  await expect(shown).not.toHaveCount(0);
  for (const text of await shown.allInnerTexts()) expect(text.toLowerCase()).toContain("security");
  const left = await sections.filter({ visible: true }).count();
  expect(left).toBeLessThan(all);
  // The links atop the page lead only to the facets that are left.
  await expect(page.locator(".toc a:visible")).toHaveCount(left);

  await input.fill("zzzqqq");
  await expect(page.locator("#tag-none")).toHaveText("No tag matches “zzzqqq”.");
  await expect(sections.filter({ visible: true })).toHaveCount(0);

  await input.fill("");
  await expect(sections.filter({ visible: true })).toHaveCount(all);
  await expect(page.locator(".toc a:visible")).toHaveCount(all);
  await expect(page.locator("#tag-none")).toBeHidden();

  // Stack is an open vocabulary: the page lists the stack tags the skills have, each with skills.
  const stack = page.locator("#facet-stack .cloud-item");
  await expect(stack).toHaveCount(stackTags.size);
  expect(await stack.locator(".tag").evaluateAll((tags) => tags.map((t) => t.dataset.tag))).toEqual(
    expect.arrayContaining([...stackTags]),
  );
  expect(await stack.locator(".n").allTextContents()).not.toContain("0");
  // No tag is cut in two at a line's end, where its halves would look like two tags.
  const cut = await page
    .locator(".cloud-item .tag")
    .evaluateAll((tags) => tags.filter((t) => t.getClientRects().length > 1).length);
  expect(cut).toBe(0);

  const tag = page.locator(".tag-table a.tag").first();
  const name = (await tag.getAttribute("data-tag")) as string;
  await tag.click();
  await ready(page);
  await expect(page).toHaveURL(`/?tag=${encodeURIComponent(name)}`);
});

test("the about page counts what the site lists, and explains each row", async ({ page }) => {
  await open(page, "/about/");
  const listed = page.locator(".breakdown tr", {
    has: page.getByRole("button", { name: "About Listed", exact: true }),
  });
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
  // So does a second click, though the first gave its button the focus, which shows it too.
  await listed.locator(".tip-i").click();
  await page.mouse.move(0, 0);
  await expect(tip).toBeVisible();
  await listed.locator(".tip-i").click();
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
});

test("the list's tagline and the about page give the same number of reviewed skills", async ({
  page,
}) => {
  await open(page, "/about/");
  const row = page.locator(".breakdown tr", {
    has: page.getByRole("button", { name: "About Reviewed", exact: true }),
  });
  // innerText leaves out the row's hidden tooltip, which is in the same cell.
  const reviewed = (await row.locator(".num").innerText()).trim();
  expect(reviewed).toMatch(/^[\d,]+$/);
  await expect(page.locator(".lede")).toContainText(`a review of the ${reviewed} `);
  await open(page, "/");
  await expect(page.locator(".list-sub")).toContainText(`from ${reviewed} reviewed skills`);
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

  test("an address with capitals, as GitHub writes some names, leads to its page", async ({
    page,
  }) => {
    // The pages' addresses are lowercase: in capitals there's none, until it's tried in lowercase.
    await page.goto(skillUrl.toUpperCase());
    await expect(page).toHaveURL(skillUrl);
    await ready(page);
    await expect(page.locator("h1")).toHaveText(skill.name);
  });

  test("a bundle's address with its repo's capitals, as it once was, leads to its page", async ({
    page,
  }) => {
    const cased = data.bundles.find((b) => b.id !== b.id.toLowerCase());
    test.skip(!cased, "no bundle's id has capitals today");
    if (!cased) return;
    await page.goto(`/bundle/${cased.id}/`);
    await expect(page).toHaveURL(`/${bundlePage(cased)}/`);
    await ready(page);
    await expect(page.locator("h1")).toContainText(cased.agentReview.name);
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
