/**
 * Tags: the search narrows the page to the tags whose name, label or meaning hold each of its
 * words, and to the facets and topic groups that have any, with their links atop the page. It reads
 * a search as the skills list's does (see search-terms.ts), and finds the tags that one finds.
 */

import "../../account-client.ts";
import { ready } from "../../ready.ts";
import { plain, sought, terms, type Term } from "../../search-terms.ts";

const input = document.getElementById("tag-q") as HTMLInputElement;
const none = document.getElementById("tag-none") as HTMLElement;

/**
 * Whether a table's row, or a cloud's tag, has each word: in its text, or in its tag's meaning. A
 * word has to start one of theirs, as in the skills list's search for tags: anywhere in a word,
 * "git" found flag:dual-use, by "legitimate", and "ui" a dozen tags, by "build" and "guidelines".
 */
const fits = (el: HTMLElement, words: Term[]) => {
  const text = plain(`${el.textContent} ${el.querySelector<HTMLElement>(".tag")?.title ?? ""}`);
  return words.every(({ start }) => start.test(text));
};

/** Hide what doesn't fit; whether anything in `els` is left. */
function show(els: Iterable<HTMLElement>, words: Term[]): boolean {
  let any = false;
  for (const el of els) {
    el.hidden = !fits(el, words);
    any ||= !el.hidden;
  }
  return any;
}

function search() {
  const words = terms(sought(input.value));
  let any = false;
  for (const section of document.querySelectorAll<HTMLElement>(".facet-doc")) {
    let inSection = show(section.querySelectorAll<HTMLElement>(".tag-table tbody tr"), words);
    for (const cloud of section.querySelectorAll<HTMLElement>(".cloud")) {
      const inCloud = show(cloud.querySelectorAll<HTMLElement>(".cloud-item"), words);
      cloud.hidden = !inCloud;
      // A topic group's name goes with its tags.
      const name = cloud.previousElementSibling;
      if (name instanceof HTMLElement && name.tagName === "H3") name.hidden = !inCloud;
      inSection ||= inCloud;
    }
    section.hidden = !inSection;
    // Its link atop the page would lead nowhere.
    document
      .querySelector<HTMLElement>(`.toc a[href="#${section.id}"]`)
      ?.toggleAttribute("hidden", !inSection);
    any ||= inSection;
  }
  none.hidden = any;
  none.textContent = any ? "" : `No tag matches “${input.value.trim()}”.`;
}

input.addEventListener("input", search);
// The browser may restore what was typed, such as after going back.
if (input.value) search();

ready();
