# Plan: make every TLDR glance item read on its own after "Label:"

Delete this file in the commit that finishes the work.

## Why

The site now shows each glance item of a TLDR as **Label: Text.** It adds the colon after the label (`glanceHtml` in `website/skills.ts`) and the full stop after the text (`glanceEnd` in `website/format.ts`). The items' first words were capitalized in `data/skills.jsonc`, except names written in lowercase such as `uv`, `grill-me` or `report.md`.

But the TLDRs were written for the old look, where the label started a sentence that the text finished. Most items still read fine. Many **Unlike** items don't, because their text continues the label:

- **Unlike browser-act:** Which drives a browser for one task, it keeps what it learned as a skill you can rerun.
- **Unlike:** copywriting from the same repo, it recommends tactics and explains them rather than writing the words.
- **Unlike seo-audit:** From the same repo, which diagnoses classic search ranking, it targets being quoted by AI assistants.

Rewrite those so each item is a sentence of its own. Read the style rules first: `.claude/skills/write-tldr/SKILL.md`, section "3. Write", especially the paragraph that starts "The site shows each glance item as…".

## Scope

1. **All 383 glance items whose label starts with "Unlike"**, across skills and bundles in `data/skills.jsonc`. Roughly 250 to 300 need a rewrite:
   - **Label is a bare "Unlike" (153 items):** all of them. Their text is the noun phrase the label led into.
   - **Label "Unlike X" whose text starts with "Which", "From the same repo", or a phrase describing X followed by ", it…" or ", this…":** for example "Anthropic's Playwright skill, where the agent writes whole Python scripts, this runs…", "Its sibling skill focused on…, it covers…", "A skill it calls more drastic, this one…", "Where the main agent does every task itself…; this costs more…", "Such as…".
   - **Already a full sentence:** leave it alone, such as "It leaves a paper trail; grill-me runs the same interview and saves nothing", or "That skill questions you about your own plan; this one asks…".
2. **The few other items that still continue their label.** List the items outside Unlike whose text starts with Which, Whose, Where, From, And, But, Or, Than or Such, then fix those that don't read right after "Label:". Most are fine, such as "Runs: From the terminal".
3. **Capitalized names.** While reading, fix any item whose first word is a name that was capitalized by mistake, such as a skill, command or brand written in lowercase.

## How to rewrite an Unlike item

- **Label:** "Unlike X", naming what it's compared with, as written, such as `Unlike seo-audit`. Labels have at most 4 words. When several skills don't fit, use something like "Unlike its siblings" and name them in the text.
- **Text:** one sentence on its own. The usual shape is "That one <does A>; this one <does B>".
  - Keep every fact the old text had, such as "from the same repo", "by the same author", whose skill it is, or "its sibling". Add none.
  - When the old text only says what X does, say only that, such as "That one drafts new sections from your evidence".
  - If it's unclear, the SKILL.md copies are in `data/skill-snapshots/`.
- **Limits:** start with a capital, unless the first word is a lowercase name. No full stop at the end. At most 30 words. Keep "this one" rather than "this" or "it", so it's clear which skill is meant.

Examples, before → after:

| Before | After |
|---|---|
| **Unlike browser-act:** Which drives a browser for one task, it keeps what it learned as a skill you can rerun | **Unlike browser-act:** That one drives a browser for one task; this one keeps what it learned as a skill you can rerun |
| **Unlike:** copywriting from the same repo, it recommends tactics and explains them rather than writing the words | **Unlike copywriting:** That one, from the same repo, writes the words; this one recommends tactics and explains them |
| **Unlike seo-audit:** From the same repo, which diagnoses classic search ranking, it targets being quoted by AI assistants | **Unlike seo-audit:** That one, from the same repo, diagnoses classic search ranking; this one targets being quoted by AI assistants |
| **Unlike webapp-testing:** Anthropic's Playwright skill, where the agent writes whole Python scripts, this runs one command per action and shows the result each time | **Unlike webapp-testing:** In Anthropic's Playwright skill, the agent writes whole Python scripts; this one runs one command per action and shows the result each time |
| **Unlike:** nature-writing, which drafts new sections from your evidence | **Unlike nature-writing:** That one drafts new sections from your evidence |

## Tools

Edit the items in place with the repo's own reader and writer. This keeps the file's formatting and comments, and it leaves each TLDR's permalink, model and effort alone. Don't use `pnpm run tldr`: it rewrites a whole TLDR and resets its permalink.

Put these two scripts in your scratchpad, outside the repo, and run them from the repo root with `pnpm run -s node-ts <script>`. Change the import path to wherever the repo is.

`list.ts` prints every Unlike item as one JSON line, with the item's index `i` in its TLDR's glance:

```ts
import { readData } from "/home/user/skillhub/scripts/data.ts";
const data = readData();
for (const e of [...data.skills, ...data.bundles])
  e.agentReview.tldr?.glance.forEach((g, i) => {
    if (/^Unlike\b/.test(g.label)) console.log(JSON.stringify({ id: e.id, i, label: g.label, text: g.text }));
  });
```

`apply.ts <edits.jsonl>` writes edits, one JSON line each, in the same shape `{id, i, label, text}`:

```ts
import { readFileSync } from "node:fs";
import { readData, writeData } from "/home/user/skillhub/scripts/data.ts";
const data = readData();
const byId = new Map([...data.skills, ...data.bundles].map((e) => [e.id, e]));
for (const line of readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)) {
  const { id, i, label, text } = JSON.parse(line);
  const g = byId.get(id)?.agentReview.tldr?.glance[i];
  if (!g) throw new Error(`No glance item ${i} for ${id}`);
  Object.assign(g, { label, text });
}
writeData(data);
```

Both were tested: a read and write with no edits leaves the file unchanged, and one edit changes only its own label and text lines.

The work splits well: list the items, then give batches of about 100 to subagents. Each subagent gets this plan and the style rules, and returns edits as JSON lines, leaving out the items that are already fine. Then read all the edits yourself, so they read alike, before applying them.

## Check and ship

1. Run `pnpm run check`. It enforces the limits: 4 words per label and 30 per glance item.
2. Run `git diff --stat`. Only `data/skills.jsonc` should change, and only glance labels and texts. Read through `git diff`.
3. Run `pnpm build`, then look at a few pages in `website/dist/client/`, such as `nutlope/hallmark/hallmark/index.html` and the pages of skills you rewrote.
4. Commit, delete this plan in the same commit, and push to `main`, as `AGENTS.md` says.
