/**
 * The skills list's preview: on a wide screen, a click on a row (see row-links.ts) opens its skill
 * or bundle on a sheet over the window's left side, its whole height, up to the rows' words: over
 * the tags and the rows' numbers. What the row shows and more: every fact of its TLDR, its note,
 * its numbers, how to install it, its TLDR's prose, and the start of its SKILL.md, or a bundle's
 * skills. Once open, it follows the mouse from row to row, so that a click on a row, the one it
 * shows, closes it, as do a click anywhere but on a row or on the preview itself, the preview's ×,
 * and Escape. Its page is a click away, from All details, on the preview and on the row.
 *
 * It opens on a click rather than when the pointer rests on a row: one that opened by itself hid
 * the tags, the search and the settings whenever the pointer was on the list. On a narrow screen,
 * where it would have only the tags' column, a click on a row opens its page.
 */

import { age, commandHtml, esc, plural } from "./format.ts";
import { copyButton, mountCopyButtons } from "./copy.ts";
import {
  bundleHref,
  data,
  glanceHtml,
  installCommand,
  installsOf,
  isBundle,
  nameOf,
  publishedOf,
  repoKey,
  skillById,
  skillHref,
  starsOf,
  weekOf,
} from "./skills.ts";
import type { ClientBundle as Bundle, ClientSkill as Skill, Prose } from "./client-data.ts";

type Entry = Skill | Bundle;

/** The narrowest window it opens in: under it, a row's numbers go under its words (see style.css), and the tags' column alone is too narrow for it. */
const wide = matchMedia("(min-width: 1151px)");

const pane = document.getElementById("preview") as HTMLElement;
const results = document.getElementById("results") as HTMLElement;

/** The TLDRs' prose, once list-client.ts has loaded it: until then the preview goes without. */
let prose: Prose | null = null;
export function setPreviewProse(p: Prose) {
  prose = p;
  if (shown) show(shown, true);
}

/** Each row's skill or bundle, by the link of its name. */
let byHref: Map<string, Entry> | undefined;
function entryOf(row: Element): Entry | undefined {
  byHref ??= new Map<string, Entry>([
    ...data.skills.map((s): [string, Entry] => [skillHref(s.id), s]),
    ...data.bundles.map((b): [string, Entry] => [bundleHref(b.id), b]),
  ]);
  return byHref.get(row.querySelector(".skill-name")?.getAttribute("href") ?? "");
}

const pageOf = (e: Entry) => (isBundle(e) ? bundleHref(e.id) : skillHref(e.id));

// ------------------------------------------------------------------- what it shows

/** The 8 weeks' downloads as a line, as the Weekly Downloads tile of a skill's page draws them, smaller. */
function sparkHtml(weekly: number[] | null): string {
  if (!weekly || weekly.length < 2) return "";
  const max = Math.max(...weekly, 1);
  const points = weekly
    .map(
      (v, i) =>
        `${((i * 100) / (weekly.length - 1)).toFixed(1)},${(22 - (v / max) * 20).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="preview-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg>`;
}

/** Its numbers, which it covers on its row: exact, as on its page. An unknown one is left out. */
function statsHtml(e: Entry): string {
  const week = weekOf(e);
  const total = installsOf(e);
  const stars = starsOf(e);
  const published = publishedOf(e);
  const stat = (label: string, value: string, more = "") =>
    `<div><dt>${label}</dt><dd>${value}${more}</dd></div>`;
  const stats = [
    week === null
      ? ""
      : stat(
          "Weekly downloads",
          week.toLocaleString("en"),
          isBundle(e) ? "" : sparkHtml(e["skills.sh"].weeklyInstalls),
        ),
    total === null ? "" : stat("Total downloads", total.toLocaleString("en")),
    stars === null ? "" : stat("Repo stars", stars.toLocaleString("en")),
    published === null ? "" : stat("Age", age(published, data.asOf.installs)),
  ].filter(Boolean);
  if (!stats.length) return "";
  // A bundle's numbers are its skills' most, as on its row.
  const most = isBundle(e) ? `<p class="muted">The most of any of its skills.</p>` : "";
  return `<dl class="preview-stats">${stats.join("")}</dl>${most}`;
}

const CROSS = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>`;

function paneHtml(e: Entry): string {
  const review = e.agentReview;
  const text = prose && (isBundle(e) ? prose.bundles : prose.skills)[e.id];
  const note = isBundle(e) ? undefined : e.agentReview.note;
  const install = isBundle(e)
    ? ""
    : `<div class="install"><code>${commandHtml(installCommand(e))}</code>${copyButton(installCommand(e))}</div>`;
  const end = isBundle(e)
    ? `<section class="preview-part"><h3>Its skills</h3><p class="members">${e.agentReview.skills
        .map(({ id }) => `<a href="${skillHref(id)}">${esc(skillById.get(id)?.name ?? id)}</a>`)
        .join(", ")}</p></section>`
    : `<section class="preview-part"><h3>SKILL.md</h3><div data-skill-md><p class="muted">Loading its SKILL.md…</p></div></section>`;
  return `
    <div class="preview-head">
      <div class="preview-title">
        <h2>${esc(nameOf(e))}${isBundle(e) ? ` <span class="kind">Bundle of ${plural(e.agentReview.skills.length, "skill")}</span>` : ""}</h2>
        <p class="skill-source">${esc(repoKey(e))}</p>
      </div>
      <a class="details" href="${pageOf(e)}">All details</a>
      <button type="button" class="preview-close" data-close-preview aria-label="Close the preview">${CROSS}</button>
    </div>
    ${review.tldr?.glance.length ? glanceHtml(review.tldr.glance) : `<p class="skill-desc">${esc(review.description)}</p>`}
    ${note ? `<p class="note">${esc(note)}</p>` : ""}
    ${statsHtml(e)}
    ${install}
    ${
      text
        ? `<section class="preview-part"><h3>TL;DR</h3>${text
            .split(/\n\s*\n/)
            .map((p) => `<p>${esc(p)}</p>`)
            .join("")}</section>`
        : ""
    }
    ${end}`;
}

/**
 * The start of a skill's SKILL.md, from its page: the line saying where the copy is from, and its
 * first blocks, some 500 characters' worth. Each skill's page is fetched once, when its preview
 * first opens.
 */
const skillMds = new Map<string, Promise<string>>();
function skillMdOf(s: Skill): Promise<string> {
  const page = skillHref(s.id);
  let html = skillMds.get(s.id);
  if (!html) {
    html = fetch(page)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => startOf(text, page))
      .catch(() => {
        // Tried again the next time it opens.
        skillMds.delete(s.id);
        return `<p class="muted">Its SKILL.md didn't load: it's on <a href="${page}">its page</a>.</p>`;
      });
    skillMds.set(s.id, html);
  }
  return html;
}

function startOf(text: string, page: string): string {
  const section = new DOMParser().parseFromString(text, "text/html").querySelector(".skill-md");
  if (!section) return "";
  // Its headings' ids would be the list's: a link to one of them leads to its page.
  for (const el of section.querySelectorAll("[id]")) el.removeAttribute("id");
  for (const a of section.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    a.setAttribute("href", page + a.getAttribute("href"));
  const from = section.querySelector(":scope > p.muted");
  const fromHtml = from ? `<p class="muted">${from.innerHTML}</p>` : "";
  const markdown = section.querySelector(".markdown");
  if (!markdown) return fromHtml;
  const blocks: string[] = [];
  let length = 0;
  for (const block of markdown.children) {
    if (length > 500 || blocks.length >= 5) break;
    blocks.push(block.outerHTML);
    length += block.textContent?.length ?? 0;
  }
  return `${fromHtml}<div class="markdown">${blocks.join("")}</div><p><a href="${page}">Read it all on its page</a></p>`;
}

// ------------------------------------------------------------------- opening and closing

/** The row whose preview is open. */
let shown: HTMLElement | null = null;

function show(row: HTMLElement, again = false) {
  const e = entryOf(row);
  if (!e) return;
  shown?.classList.remove("previewed");
  shown = row;
  row.classList.add("previewed");
  pane.setAttribute("aria-label", `Preview of ${nameOf(e)}`);
  pane.innerHTML = paneHtml(e);
  if (!again) pane.scrollTop = 0;
  pane.hidden = false;
  place();
  if (!isBundle(e))
    void skillMdOf(e).then((html) => {
      const slot = shown === row && pane.querySelector("[data-skill-md]");
      if (slot) slot.innerHTML = html;
    });
}

/**
 * For a click on a row: opens its preview, or closes it when it's the one open, as the row the
 * mouse is on is once it's open. False on a narrow screen, where the click opens the row's page.
 */
export function previewRow(row: HTMLElement): boolean {
  if (!wide.matches) return false;
  if (row === shown) hidePreview();
  else show(row);
  return true;
}

/** Closes it, as when the list is rendered again, whose rows it was about. */
export function hidePreview() {
  shown?.classList.remove("previewed");
  shown = null;
  pane.hidden = true;
}

/**
 * From the window's left edge to just short of the rows' words, its words starting where the tags
 * do, at --left, rather than at the window's edge, which can be far from the list on a wide
 * screen. See #preview in style.css.
 */
function place() {
  if (pane.hidden) return;
  const tags = document.getElementById("facets")?.getBoundingClientRect();
  const words = results.querySelector(".skill-list > li .skill-body")?.getBoundingClientRect();
  if (!tags || !words) return hidePreview();
  pane.style.setProperty("--left", `${tags.left}px`);
  pane.style.setProperty("--width", `${words.left - 16}px`);
}

// Open, it shows the row the mouse is on. Not a touch's: a tap on another row is a click on it.
results.addEventListener("pointerover", (event) => {
  if (!shown || event.pointerType !== "mouse") return;
  const row = (event.target as Element).closest<HTMLElement>(".skill-list > li");
  if (row && row !== shown) show(row);
});

// A click outside the rows, which row-links.ts takes, and outside the preview, closes it.
document.addEventListener("click", (event) => {
  const target = event.target as Element;
  if (shown && !pane.contains(target) && !target.closest(".skill-list > li")) hidePreview();
});

pane.addEventListener("click", (event) => {
  if ((event.target as Element).closest("[data-close-preview]")) hidePreview();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && shown) hidePreview();
});
addEventListener("resize", () => (wide.matches ? place() : hidePreview()));

mountCopyButtons();
