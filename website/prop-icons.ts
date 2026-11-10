/**
 * The icons that stand for the numbers in the skills list's rows, and on the filters' pills: see
 * PROPS in list.ts. The two download numbers and the growth share an icon, with a word under it.
 * Each is drawn once per page, in iconDefsHtml, which crowdDefsHtml adds; a row only refers to it,
 * as the list repeats them in its every row.
 */

const SHAPES = {
  /** A chick hatching, for its age. Its eye is a hole, so that it shows on any background. */
  chick: `<path d="M2 8.75 4 10.75 6 8.75 8 10.75 10 8.75 12 10.75 14 8.75v.75a6 5.25 0 0 1-12 0Z" fill="currentColor" /><path d="M4 5a3.25 3.25 0 1 0 6.5 0a3.25 3.25 0 1 0-6.5 0ZM7.05 4.35a.95.95 0 1 0 1.9 0a.95.95 0 1 0-1.9 0Z" fill="currentColor" fill-rule="evenodd" stroke="none" /><path d="M10.25 4 13.5 5 10.25 6Z" fill="currentColor" />`,
  star: `<path d="m8 1.9 1.85 3.9 4.25.55-3.1 2.95.8 4.2L8 11.45 4.2 13.5l.8-4.2-3.1-2.95 4.25-.55Z" />`,
  download: `<path d="M8 2v8M4.75 6.75 8 10l3.25-3.25M2.25 11v1.5c0 .7.55 1.25 1.25 1.25h9c.7 0 1.25-.55 1.25-1.25V11" />`,
};

// Their size and stroke are in the CSS's .prop-icon, which the shapes inherit through <use>.
const icon = (name: keyof typeof SHAPES) =>
  `<svg class="prop-icon" aria-hidden="true"><use href="#icon-${name}" /></svg>`;

export const CHICK = icon("chick");
export const STAR = icon("star");
export const DOWNLOAD = icon("download");

/** The icons' shapes, for a page's <defs>. */
export const iconDefsHtml = () =>
  Object.entries(SHAPES)
    .map(([name, body]) => `<symbol id="icon-${name}" viewBox="0 0 16 16">${body}</symbol>`)
    .join("");
