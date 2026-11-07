/**
 * What the browser gets of skills.jsonc. The skills list's client script embeds the data, so the
 * jsonc plugin of pages/+config.ts gives it a trimmed copy: without the fields no client code reads,
 * and without the TLDRs' prose, which only the search reads and which is half the data. The prose
 * comes as `searchWords`, a module the client script loads after the page (see list-client.ts).
 * Pages render on the server, with all of the data.
 */

import type { Data } from "../data/types.ts";

/**
 * The distinct words of each TLDR's prose, lowercased, keyed by skill or bundle id. The search
 * only asks whether a word is in a text and whether it starts a word there, so these find and rank
 * exactly as the prose would.
 */
export interface SearchWords {
  skills: Record<string, string>;
  bundles: Record<string, string>;
}

const distinct = (text: string) =>
  [...new Set(text.toLowerCase().split(/\s+/).filter(Boolean))].join(" ");

export function searchWords(data: Data): SearchWords {
  const of = (entries: { id: string; agentReview: { tldr?: { text?: string } } }[]) =>
    Object.fromEntries(
      entries.flatMap((e) =>
        e.agentReview.tldr?.text ? [[e.id, distinct(e.agentReview.tldr.text)]] : [],
      ),
    );
  return { skills: of(data.skills), bundles: of(data.bundles) };
}

const drop = (o: object | undefined, ...keys: string[]) => {
  for (const k of keys) if (o) delete (o as Record<string, unknown>)[k];
};

/**
 * Takes out of `data`, in place, what the client doesn't read until later, or ever. If client code
 * starts reading one of these, take it off this list: on the client it would be undefined.
 */
export function forClient(data: Data): void {
  drop(data, "$schema");
  for (const s of data.skills) {
    drop(s, "skillMd");
    drop(s["skills.sh"], "url");
    drop(s.agentReview, "model", "effort");
    drop(s.agentReview.tldr, "text", "permalink");
  }
  for (const b of data.bundles) {
    drop(b, "skew");
    drop(b.agentReview, "install", "model", "effort");
    drop(b.agentReview.tldr, "text", "permalink");
    for (const m of b.agentReview.skills) drop(m, "note");
  }
  // The list only shows a repo's description, in the banner of a list filtered to it.
  for (const r of data.repos) drop(r.agentReview, "kind", "note", "model", "effort");
}
