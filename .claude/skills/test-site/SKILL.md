---
name: test-site
description: Run SkillHub's site and verify a change to it. Start it locally with a test login, drive it in a browser, and run the checks CI runs before it deploys, the end-to-end walk included. Use when asked to run, start, test, verify, debug or screenshot the site, when writing a test for it, and before pushing any change to website/, worker/ or e2e/.
---

# Run and test the site

A push to `main` goes live within two minutes, so check a change before pushing it.

## Check a change

```bash
pnpm check                      # the data files and the types: 5 s
pnpm test:e2e                   # the end-to-end walk, e2e/: 1 min
pnpm build && pnpm check:site   # the built site's links and ids: 15 s
```

CI runs all three, in `.github/workflows/deploy.yml`, and deploys only when they pass. A failed walk in CI leaves its screenshots as the run's `test-results` artifact.

`pnpm test:e2e` uses whatever serves `localhost:3000`, such as a `pnpm dev` you left running. With nothing there, it builds the site and starts `pnpm preview` itself. One test: `pnpm test:e2e -g "part of its name"`.

## Run it

```bash
pnpm dev             # the site at http://localhost:3000, with hot reload
pnpm dev --fresh     # the same, from an empty database
pnpm preview         # the built site, as Cloudflare serves it: run pnpm build first
pnpm dev:stop        # stop the one running in this checkout, from anywhere
```

- **Ready:** it prints a line starting with `Ready:` once the site and the Worker answer. Started in the background, wait for that line, or for `http://localhost:3000/api/me` to answer.
- **Ports:** 3000 for the site, and in `pnpm dev` 8787 for the Worker, which the site proxies `/api/*` to. A taken port fails at once: run `pnpm dev:stop`, then start again.
- **Stopping:** Ctrl-C, or `pnpm dev:stop`. A `kill` of `pnpm dev` itself does nothing, as pnpm doesn't pass the signal on.
- **404s and trailing slashes** behave as in production only in `pnpm preview`.

## Log in and save

Locally, Log in logs you in as a test user at once, without GitHub: see `DEV_LOGIN` in `worker/index.ts`. There's only that one user. GitHub's own callback can't run locally.

The database is in `.wrangler/state/` and keeps what you saved between runs. Read or change it while the site runs:

```bash
pnpm exec wrangler d1 execute skillhub --local --command "SELECT * FROM saves"
```

That's also how to reach states the pages can't set up fast, such as the most a person can save: insert 1,000 rows for user `0`, then save one more.

## Drive it in a browser

The pages are pre-rendered, so they show before their controls work. Wait for what the page says about itself, never for a fixed time:

| Wait for | Meaning |
| --- | --- |
| `html[data-ready]` | The page's script ran: its controls work |
| `html[data-account]` | The API told who's logged in: the Save buttons and the Saved switch show it |
| `html[data-search-words]` | The search looks through the TLDRs' prose too; until then it finds fewer skills |
| no `#results[aria-busy="true"]` | The list a change leads to is complete |

`networkidle` isn't one of them: in `pnpm dev` it fires before the home page's script runs.

- **Selectors:** the controls carry what they do, such as `[data-preset="top"]`, `[data-tag="type:workflow"]`, `[data-show="bundles"]`, `[data-save]`, `#q`, `#sort`, `#saved-switch`, and their state in `aria-pressed`, `aria-expanded` and `aria-checked`.
- **The whole list is heavy:** `/` holds some 90,000 elements. Whatever reads the whole page is slow there: axe takes 30 s, and Playwright describes the whole page on every retry of an `expect` that starts out wrong on an element that isn't visible, which stalls the page for seconds. Use a shorter list for such things, such as `/?show=bundles` or a search.
- **Screens:** the tests use 1440×900, and 390×844 for a phone. Dark mode is the header's toggle, or Playwright's `colorScheme: "dark"`.
- **The app's own functions:** in a `pnpm dev` page, `await import("/list.ts")` gives them with the real data, such as `parse` and `query`.

## Write a test

Add it to the spec in `e2e/` that covers its page, with the helpers of `e2e/fixtures.ts`: `open`, `ready`, `settled`, `searchable`, `accountLoaded`.

- **No numbers, no names:** the data changes every day. `e2e/data.ts` derives what the pages should show from the data files, such as the skill and the bundle to test with.
- **Any browser error fails a test:** console errors, uncaught exceptions, failed requests and error responses. A test that brings one about on purpose, such as a 404, says so with `test.use({ expected: /…/ })`.
- **The account's tests share the one test user,** so they're in `account.spec.ts`, which runs in order and starts each test from nothing saved. Tests elsewhere don't log in.

## What it can't show you

Today's data has no skill or bundle for some of what the pages handle, so neither the eye nor the walk sees it: a skill without a TLDR, without a copy of its SKILL.md, with unknown installs, weekly installs, first-seen date or stars, one flagged `republished`, and a bundle without a TLDR. Some go live unreviewed, such as a skill between the add-skill and write-tldr skills. When you change how one of them renders, set it up by editing `data/skills.jsonc` locally, look, and don't commit the edit.
