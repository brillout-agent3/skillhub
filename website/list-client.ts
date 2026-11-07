/** The skills list's settings and filters: re-render the list whenever they change, and keep them in the URL. */

import {
  PRESETS,
  PROPS,
  facetsHtml,
  fullRange,
  rangeLabel,
  parse,
  askPrompt,
  fullRanges,
  patched,
  sinceRange,
  query,
  resultsHtml,
  rowCount,
  rowsHtml,
  settingsHtml,
  toggleTag,
  type Preset,
  type Prop,
  type Range,
  type Show,
  type Sort,
  type State,
} from "./list.ts";
import { compact, href } from "./format.ts";

const app = document.getElementById("app") as HTMLElement;
const q = document.getElementById("q") as HTMLInputElement;
/** The tag search narrows the facets to the tags it names; it isn't a filter, so it stays out of the URL. */
const tagQ = document.getElementById("tag-q") as HTMLInputElement;
let state = parse(location.search);
let stackExpanded = false;
let tagQuery = tagQ.value.trim();

function go(patch: Partial<State>) {
  state = patched(state, patch);
  history.replaceState(null, "", query(state) || location.pathname);
  renderSoon();
}

let soon = false;
/**
 * Render after the next paint, once for however many changes come before it, so that the control
 * just used shows its new state without waiting for the list.
 */
function renderSoon() {
  if (soon) return;
  soon = true;
  requestAnimationFrame(() =>
    setTimeout(() => {
      soon = false;
      render();
    }),
  );
}

/** Re-rendering replaces the buttons; put focus back on the one that was used. */
function focusSelector(): string | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el.id === "q" || !app.contains(el)) return null;
  for (const attr of ["data-tag", "data-action", "data-remove", "data-preset", "data-show"]) {
    const v = el.getAttribute(attr);
    if (v !== null)
      return `#${el.closest("#facets") ? "facets" : el.closest("#settings") ? "settings" : "results"} [${attr}="${CSS.escape(v)}"]`;
  }
  return el.id ? `#${CSS.escape(el.id)}` : null;
}

/** The sliders aren't re-rendered, so that one can be dragged while the list updates; they follow the state instead. */
function syncRanges() {
  for (const p of Object.keys(PROPS) as Prop[]) {
    const range = state.ranges[p];
    const slider = app.querySelector<HTMLElement>(`[data-slider="${p}"]`);
    if (!slider) continue;
    const last = PROPS[p].stops.length - 1;
    slider.style.setProperty("--lo", String(range[0] / last));
    slider.style.setProperty("--hi", String(range[1] / last));
    for (const input of slider.querySelectorAll<HTMLInputElement>("input")) {
      input.value = String(range[Number(input.dataset.end)]);
      input.setAttribute("aria-valuetext", rangeLabel(p, range));
    }
    const label = app.querySelector(`[data-range-label="${p}"]`);
    if (label) label.textContent = rangeLabel(p, range);
  }
}

/** Rows rendered right away; the rest follow STEP at a time, so a change shows without waiting for the whole list. */
const FIRST = 40;
const STEP = 150;
/** Counts renders, so that rows still on their way for an older one are dropped. */
let renders = 0;
/** What the facets were last rendered for: the pre-rendered page's are for no filters. */
let lastFacets = "";

/** The facets don't depend on the sort, so a preset leaves them as they are. */
function renderFacets() {
  const key = JSON.stringify([
    state.q,
    state.tags,
    state.repo,
    state.ranges,
    state.show,
    stackExpanded,
    tagQuery,
  ]);
  if (key === lastFacets) return;
  lastFacets = key;
  (document.getElementById("facets") as HTMLElement).innerHTML = facetsHtml(
    state,
    stackExpanded,
    tagQuery,
  );
}

function render() {
  const focus = focusSelector();
  if (q.value !== state.q) q.value = state.q;
  syncRanges();
  (document.getElementById("settings") as HTMLElement).innerHTML = settingsHtml(state);
  renderFacets();
  const results = document.getElementById("results") as HTMLElement;
  results.innerHTML = resultsHtml(state, FIRST);
  if (focus) (document.querySelector(focus) as HTMLElement | null)?.focus({ preventScroll: true });
  const st = state;
  const id = ++renders;
  const append = (from: number) => {
    if (id !== renders || from >= rowCount(st)) return;
    results
      .querySelector(".skill-list")
      ?.insertAdjacentHTML("beforeend", rowsHtml(st, from, from + STEP));
    setTimeout(() => append(from + STEP));
  };
  setTimeout(() => append(FIRST));
}

/** Copy the prompt for an agent, and say how big it is: a large catalog can be too much for some agents. */
function ask(button: HTMLElement) {
  const prompt = askPrompt(state, new URL(href(), location.origin).href);
  navigator.clipboard?.writeText(prompt).then(() => {
    const label = button.textContent;
    button.textContent = `Copied, ~${compact(Math.round(prompt.length / 4))} tokens: paste it into your agent`;
    setTimeout(() => (button.textContent = label), 4000);
  });
}

q.addEventListener("input", () => go({ q: q.value }));

tagQ.addEventListener("input", () => {
  tagQuery = tagQ.value.trim();
  renderFacets();
});

app.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  const p = el.dataset.range as Prop | undefined;
  if (!p) return;
  // The handles can't cross: the range keeps at least one step.
  const [lo, hi] = state.ranges[p];
  const v = Number(el.value);
  const range: Range =
    el.dataset.end === "0" ? [Math.min(v, hi - 1), hi] : [lo, Math.max(v, lo + 1)];
  go({ ranges: { ...state.ranges, [p]: range } });
});

app.addEventListener("click", (event) => {
  const el = (event.target as Element).closest<HTMLElement>(
    "[data-tag],[data-action],[data-remove],[data-preset],[data-show]",
  );
  if (!el || el.tagName === "A") return;
  const d = el.dataset;
  // A pressed button shows it right away; the list follows after the next paint.
  if (d.preset) {
    for (const b of app.querySelectorAll("[data-preset]"))
      b.setAttribute("aria-pressed", String(b === el));
    const { sort, since } = PRESETS[d.preset as Preset];
    go({ sort, asc: false, ranges: { ...state.ranges, published: sinceRange(since) } });
  } else if (d.show) {
    for (const b of app.querySelectorAll("[data-show]"))
      b.setAttribute("aria-pressed", String(b === el));
    go({ show: d.show as Show });
  } else if (d.tag) {
    if (el.hasAttribute("aria-pressed"))
      el.setAttribute("aria-pressed", String(el.getAttribute("aria-pressed") !== "true"));
    go({ tags: toggleTag(state.tags, d.tag) });
  } else if (d.remove) {
    const v = d.value ?? "";
    if (d.remove === "q") go({ q: "" });
    else if (d.remove === "tag") go({ tags: state.tags.filter((t) => t !== v) });
    else if (d.remove === "repo") go({ repo: null });
    else if (d.remove === "range") go({ ranges: { ...state.ranges, [v]: fullRange(v as Prop) } });
  } else if (d.action === "clear")
    go({
      q: "",
      tags: [],
      repo: null,
      ranges: fullRanges(),
    });
  else if (d.action === "ask") ask(el);
  else if (d.action === "order") go({ asc: !state.asc });
  else if (d.action === "stack") {
    stackExpanded = !stackExpanded;
    renderSoon();
  } else if (d.action === "filters") document.getElementById("filters")?.classList.toggle("shown");
});

app.addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "sort") go({ sort: el.value as Sort });
});

// The page was pre-rendered unfiltered, and without a tag search.
if (location.search) render();
else if (tagQuery) renderFacets();
