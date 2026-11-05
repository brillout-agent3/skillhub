---
name: add-skill
description: Add a skill to SkillHub's skills.json, or retag one, including whether it belongs to a bundle. Use when asked to add, tag, retag or review skills, to record a bundle of skills, or to work through the queue of candidate skills.
---

# Add or retag a skill

1. Add its entry to `skills` in `data/skills.json`. SkillHub only lists skills that are on GitHub and on skills.sh: its `id` is where its SKILL.md lives on GitHub, as `Skill` in `website/types.ts` describes, its repo needs an entry in `repos`, and its `skills.sh` field holds its skills.sh listing. For a queued skill, copy that field from its entry in the queue (below). A new repo's entry can leave `stars` and `leaderboardSkills` at `null`: the daily refresh fills them in.
2. Run `pnpm run sync <id>` to save a copy of its SKILL.md in `data/skill-snapshots/`.
3. Read that copy, not only the skill's one-line description, and tag it. Tag values and their meanings are under `facets` in `data/skills.json`.
   1. Give it every `category:` that fits. Don't add a parent such as `category:software-engineering`: it comes with the categories it `includes`.
   2. Give it one `type:` and one `effect:`, judged by the skill's own steps.
   3. List every `needs:` value that applies. Use `needs:none` only when nothing does.
   4. Add a `stack:` tag for each technology or service the skill is about.
   5. Add one to five topics, preferring existing ones.
   6. Add a `flag:` only with evidence, such as a matching original or a retirement notice. Add `flag:tool-docs` when the skill is documentation for agents of one product: how to build with it, configure it, deploy to it or operate it, such as a framework's best practices or a cloud's CLI. A skill that gets a job done through a tool, such as browsing, testing, scraping, searching or generating media, doesn't carry it: there, the tool is how, not what.
4. Have the tags reviewed. Tagging goes wrong often: a review of all 280 skills once corrected 59 of them, mostly effects, needs and categories that didn't match the skill's own steps. If you can start a subagent, give a fresh one only the copy, the `facets` of `data/skills.json` and your tags, and ask it to check each tag against the SKILL.md and the tag's meaning, and to name any tag that's missing. Settle each disagreement by rereading the SKILL.md. Without subagents, recheck each tag against its meaning yourself.
5. Check whether it belongs to a bundle (below).
6. Run `pnpm run check`, which rejects tags outside the vocabulary, then commit and push to `main`.
7. Write its TLDR with the write-tldr skill.

A skill tagged with one of the `skip` tags is left out of the skills list and of the daily sync; its page stays.

## The queue

`queue` in `data/candidates.json` holds the skills of the skills.sh all-time top 600 that are on GitHub but neither in `data/skills.json` nor ignored, most installed first. A daily GitHub Action rewrites it (`pnpm run leaderboard`), as `Candidates` in `scripts/data.ts` describes.

When asked to work through it:

- The user decides each time how many skills, or which ones. If they didn't say, ask, and recommend a number.
- Take a repo's queued skills together: skills.sh counts an install of a repo once per skill in it, so its skills arrive together, and they may form a bundle.
- Add each skill with the steps above, or ignore it: move it to `ignored` with a `note` saying why. Ignore what isn't a skill of its own, such as a listed skill under a second skills.sh listing (its repo under an old name, or a mirror; give the listed skill whichever listing has more installs), or what the user doesn't want. A repo's page (`https://skills.sh/owner/repo`) ignores all its skills. Don't ignore a skill only because the site would hide it, such as tool docs or a retired skill: add it with its `skip` tag, so its page stays.
- Either way, take it out of the queue: `pnpm run check` fails while a queued skill is listed or ignored.

## Bundles

A bundle is skills of one repo meant to be installed and used together, such as the steps of a workflow. A collection of unrelated skills, such as `anthropics/skills`, isn't one. Record a bundle in `bundles` in `data/skills.json`, as `Bundle` in `website/types.ts` describes:

- Its `id` is the repo, or `<repo>@<name>` when the repo holds more than one bundle, or skills outside the bundle.
- Its `skills` come in the order they're used. A skill is in one bundle at most.
- Mark a skill `standalone` when someone would install it alone and get something out of it, with no other skill of the bundle. One that loads another skill of the bundle, uses its files, or only works on another's output isn't, and gets a `note` saying what it needs. A soft mention, such as suggesting another skill for the next step, doesn't count.
- Give it a one-sentence `description`, its `install` commands from the repo's README, each with a `label` saying where it works, and a TLDR, with the write-tldr skill.

Standalone skills keep an entry of their own in the skills list; the others are only listed inside their bundle.
