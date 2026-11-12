/**
 * The skills list's preview: on a wide screen, with a mouse, resting the pointer on a row's words
 * opens the row's skill or bundle over the tags, as wide as the tags and the rows' numbers, which
 * it covers. What the row shows and more: every fact of its TLDR, its note, its numbers, its TLDR's
 * prose, and the start of its SKILL.md, or a bundle's skills. Moving down the list, it follows the
 * pointer from row to row; it closes once the pointer leaves the rows' words, and with Escape.
 *
 * It's a preview only, which the pointer goes through (see #preview in style.css): the tags under
 * it stay clickable, and a click on the row opens its page, where all of it is, with how to install
 * it. With a preview that held on to the pointer, a pointer on its way from a row to a tag ended on
 * the preview, and the tags were out of reach until it was closed. The keyboard and screen readers
 * get the pages instead, as touch screens do.
 */

import { age, esc, plural } from "./format.ts";
import {
  bundleHref,
  data,
  glanceHtml,
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

/** How long the pointer rests on a row's words before its preview opens, and how long it may be off them, such as between two rows, before the preview closes, in ms. */
const OPEN_AFTER = 300;
const CLOSE_AFTER = 200;
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
  return `<svg class="preview-spark" viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${points}" /></svg>`;
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

function paneHtml(e: Entry): string {
  const review = e.agentReview;
  const text = prose && (isBundle(e) ? prose.bundles : prose.skills)[e.id];
  const note = isBundle(e) ? undefined : e.agentReview.note;
  const end = isBundle(e)
    ? `<section class="preview-part"><h3>Its skills</h3><p class="members">${e.agentReview.skills
        .map(({ id }) => esc(skillById.get(id)?.name ?? id))
        .join(", ")}</p></section>`
    : `<section class="preview-part"><h3>SKILL.md</h3><div data-skill-md><p class="muted">Loading its SKILL.md…</p></div></section>`;
  return `
    <div class="preview-in">
      <div class="preview-head">
        <div class="preview-title">
          <h2>${esc(nameOf(e))}${isBundle(e) ? ` <span class="kind">Bundle of ${plural(e.agentReview.skills.length, "skill")}</span>` : ""}</h2>
          <p class="skill-source">${esc(repoKey(e))}</p>
        </div>
        <p class="preview-hint">Click to open its page</p>
      </div>
      ${review.tldr?.glance.length ? glanceHtml(review.tldr.glance) : `<p class="skill-desc">${esc(review.description)}</p>`}
      ${note ? `<p class="note">${esc(note)}</p>` : ""}
      ${statsHtml(e)}
      ${
        text
          ? `<section class="preview-part"><h3>TL;DR</h3>${text
              .split(/\n\s*\n/)
              .map((p) => `<p>${esc(p)}</p>`)
              .join("")}</section>`
          : ""
      }
      ${end}
    </div>`;
}

/**
 * The start of a skill's SKILL.md, from its page: the line saying where the copy is from, and its
 * first blocks, some 500 characters' worth, its links as their words. Each skill's page is fetched
 * once, when its preview first opens.
 */
const skillMds = new Map<string, Promise<string>>();
function skillMdOf(s: Skill): Promise<string> {
  let html = skillMds.get(s.id);
  if (!html) {
    html = fetch(skillHref(s.id))
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then(startOf)
      .catch(() => {
        // Tried again the next time it opens.
        skillMds.delete(s.id);
        return `<p class="muted">Its SKILL.md didn't load: it's on its page.</p>`;
      });
    skillMds.set(s.id, html);
  }
  return html;
}

function startOf(text: string): string {
  const section = new DOMParser().parseFromString(text, "text/html").querySelector(".skill-md");
  if (!section) return "";
  // Its headings' ids would be the list's; its links can't be clicked here.
  for (const el of section.querySelectorAll("[id]")) el.removeAttribute("id");
  for (const a of section.querySelectorAll("a")) a.replaceWith(...a.childNodes);
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
  return `${fromHtml}<div class="markdown">${blocks.join("")}</div>`;
}

// ------------------------------------------------------------------- opening and closing

/** The row whose preview is open. */
let shown: HTMLElement | null = null;
/** The row whose preview opens once the pointer has rested on it long enough. */
let pending: HTMLElement | null = null;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function show(row: HTMLElement, again = false) {
  if (row === shown && !again) return;
  const e = entryOf(row);
  if (!e) return;
  shown?.classList.remove("previewed");
  shown = row;
  row.classList.add("previewed");
  pane.innerHTML = paneHtml(e);
  pane.hidden = false;
  place();
  if (!isBundle(e))
    void skillMdOf(e).then((html) => {
      const slot = shown === row && pane.querySelector("[data-skill-md]");
      if (!slot) return;
      slot.innerHTML = html;
      fits();
    });
}

/** Closes it, as when the list is rendered again, whose rows it was about. */
export function hidePreview() {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  pending = null;
  shown?.classList.remove("previewed");
  shown = null;
  pane.hidden = true;
}

/**
 * Over the tags and the rows' numbers: from the tags' left edge to just short of the rows' words,
 * and from the top of the tags' column, their count's, or the window's once the page is scrolled
 * past it, to the window's bottom. See #preview in style.css.
 */
function place() {
  if (pane.hidden) return;
  const view = pane.parentElement?.getBoundingClientRect();
  const tags = document.getElementById("facets")?.getBoundingClientRect();
  const words = results.querySelector(".skill-list > li .skill-body")?.getBoundingClientRect();
  if (!view || !tags || !words) return hidePreview();
  pane.style.setProperty("--top", `${Math.max(view.top + 16, 16)}px`);
  pane.style.setProperty("--left", `${tags.left}px`);
  pane.style.setProperty("--width", `${words.left - 16 - tags.left}px`);
  fits();
}

/** What doesn't fit fades out at its bottom, which says there's more: on its page. */
function fits() {
  const inner = pane.querySelector<HTMLElement>(".preview-in");
  if (inner) pane.classList.toggle("cut", inner.scrollHeight > inner.clientHeight + 1);
}

/** The row whose words the pointer is on, for a mouse on a wide screen. */
function rowOf(event: PointerEvent): HTMLElement | null {
  if (event.pointerType !== "mouse" || !wide.matches) return null;
  const target = event.target as Element;
  return target.closest(".skill-body") ? target.closest<HTMLElement>(".skill-list > li") : null;
}

results.addEventListener("pointerover", (event) => {
  const row = rowOf(event);
  if (!row) return;
  clearTimeout(closeTimer);
  // Open, it follows the pointer at once.
  if (shown) return show(row);
  if (row === pending) return;
  pending = row;
  clearTimeout(openTimer);
  openTimer = setTimeout(() => {
    pending = null;
    show(row);
  }, OPEN_AFTER);
});

results.addEventListener("pointerout", (event) => {
  const words = (event.target as Element).closest(".skill-body");
  if (!words || words.contains(event.relatedTarget as Node | null)) return;
  clearTimeout(openTimer);
  pending = null;
  if (!shown) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(hidePreview, CLOSE_AFTER);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && shown) hidePreview();
});
addEventListener("scroll", () => requestAnimationFrame(place), { passive: true });
addEventListener("resize", () => (wide.matches ? place() : hidePreview()));
