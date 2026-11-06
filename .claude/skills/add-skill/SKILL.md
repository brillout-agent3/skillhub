---
name: add-skill
description: Approve or disqualify the qualified skills in SkillHub's crawl.jsonc, add a skill to skills.jsonc, or retag one, including whether it belongs to a bundle. Use when asked to work through the qualified skills (the queue), to add, approve, disqualify (skip), tag, retag or review skills, or to record a bundle of skills.
---

# Skills and their states

Every skill SkillHub knows of has one state, under its skills.sh page:

- **Approved:** shown on the site, with tags, a TLDR and a copy of its SKILL.md. In `data/skills.jsonc`.
- **Qualified:** in the skills.sh all-time top 600, at the minimums or above (`MINIMUMS` in `scripts/data.ts`: all-time installs, and its repo's GitHub stars), waiting for an agent to approve or disqualify it. In `data/crawl.jsonc`.
- **Unqualified:** in the top 600, but under the minimums. In `data/crawl.jsonc`.
- **Disqualified:** not shown, with a note saying why, and no agent data: no tags, no TLDR, no copy. In `data/crawl.jsonc`.

The daily crawl (`pnpm run crawl`) records new skills and moves them between qualified and unqualified. The daily sync disqualifies an approved skill whose SKILL.md is gone from its repo. The two files are cumulative: a skill never leaves them, only its state changes, and `pnpm run check` fails when a skill has two states. `Crawl` in `data/types.ts` describes crawl.jsonc.

Both files are JSONC and may hold comments, which the scripts keep. Edit them in place, or in code with `readData`/`writeData` and `readCrawl`/`writeCrawl` of `scripts/data.ts`; `JSON.parse` and `JSON.stringify` would drop the comments.

## Work through the qualified skills

- The user decides each time how many skills, or which ones. If they didn't say, ask, and recommend a number.
- Take a repo's qualified skills together: skills.sh counts an install of a repo once per skill in it, so its skills arrive together, and they may form a bundle.
- Read each skill's SKILL.md on GitHub, then disqualify it or approve it.

**Disqualify** a skill the site shouldn't show: move it from `qualified` to `disqualified`, as its skills.sh page (`url`) and a `note` saying why, and write nothing else about it. Disqualify:

- Tool docs: documentation for agents of one product, how to build with it, configure it, deploy to it or operate it, such as a framework's best practices or a cloud's CLI. They only matter once someone has chosen the product, so browsing them discovers nothing. A skill that gets a job done through a tool, such as browsing, testing, scraping, searching or generating media, isn't tool docs: there, the tool is how, not what.
- A retired skill, whose SKILL.md points to a replacement.
- A skill that isn't in English.
- A copy: a skill republished under another name, or an approved skill under a second skills.sh listing, such as its repo under an old name.
- Anything else the user doesn't want.

**Approve** the others, with the steps below. Approving an unqualified or disqualified skill works the same way, when the user asks for it.

## Approve a skill, or retag one

1. Add its entry to `skills` in `data/skills.jsonc`, and take it out of `data/crawl.jsonc`. SkillHub only shows skills that are on GitHub and on skills.sh: its `id` is where its SKILL.md lives on GitHub, as `Skill` in `data/types.ts` describes, and its `skills.sh` field comes from its entry in crawl.jsonc, and what you write about it, its description, tags and note, goes in its `agentReview`. Its repo needs an entry in `repos`; take `stars` from the crawl.jsonc entry, and leave `leaderboardSkills` at `null` for the daily crawl to fill in.
2. Run `pnpm run sync <id>` to save a copy of its SKILL.md in `data/skill-snapshots/`.
3. Read that copy, not only the skill's one-line description, and tag it. Tag values and their meanings are under `facets` in `data/skills.jsonc`.
   1. Give it every `category:` that fits. Don't add a parent such as `category:software-engineering`: it comes with the categories it `includes`.
   2. Give it one `type:` and one `effect:`, judged by the skill's own steps.
   3. List every `needs:` value that applies. Use `needs:none` only when nothing does.
   4. Add a `stack:` tag for each technology or service the skill is about.
   5. Add one to five topics, preferring existing ones.
   6. Add a `flag:` only with evidence, such as a matching original.
4. Have the tags reviewed. Tagging goes wrong often: a review of all 280 skills once corrected 59 of them, mostly effects, needs and categories that didn't match the skill's own steps. If you can start a subagent, give a fresh one only the copy, the `facets` of `data/skills.jsonc` and your tags, and ask it to check each tag against the SKILL.md and the tag's meaning, and to name any tag that's missing. Settle each disagreement by rereading the SKILL.md. Without subagents, recheck each tag against its meaning yourself.
5. Check whether it belongs to a bundle (below).
6. Run `pnpm run check`, which rejects tags outside the vocabulary, then commit and push to `main`.
7. Write its TLDR with the write-tldr skill.

## Bundles

A bundle is skills of one repo meant to be installed and used together, such as the steps of a workflow. A collection of unrelated skills, such as `anthropics/skills`, isn't one. Record a bundle in `bundles` in `data/skills.jsonc`, as `Bundle` in `data/types.ts` describes:

- Its `id` is the repo, or `<repo>@<name>` when the repo holds more than one bundle, or skills outside the bundle.
- Its `skills` come in the order they're used. A skill is in one bundle at most, and only an approved skill can be in one.
- Mark a skill `standalone` when someone would install it alone and get something out of it, with no other skill of the bundle. One that loads another skill of the bundle, uses its files, or only works on another's output isn't, and gets a `note` saying what it needs. A soft mention, such as suggesting another skill for the next step, doesn't count.
- Give it a one-sentence `description`, its `install` commands from the repo's README, each with a `label` saying where it works, and a TLDR, with the write-tldr skill.

Standalone skills keep an entry of their own in the skills list; the others are only listed inside their bundle.
