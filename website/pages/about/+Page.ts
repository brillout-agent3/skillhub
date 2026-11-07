import { date, href } from "../../format.ts";
import { review } from "../../review.ts";
import { GITHUB } from "../../skills.ts";

const n = (x: number) => x.toLocaleString("en");

/** About: how skills get on SkillHub, with the numbers of the latest crawl and reviews. */
export default function Page(): string {
  const { turnedDown: t } = review;
  const byAgent = t.toolDocs + t.language + t.copy + t.retired + t.other;
  return `
    <div class="page about">
      <h1>How skills get here</h1>
      <p class="lede">SkillHub lists <strong>${n(review.listed)} agent skills</strong>, out of the ${n(review.reviewed)} it reviewed. An AI agent read each one's SKILL.md and decided whether people browsing for skills would find it useful, and a second agent checked what the first wrote about it.</p>

      <h2>1. Finding skills</h2>
      <p>Every day, a crawl reads <a href="https://skills.sh/">skills.sh</a>, the directory the <code>npx skills</code> installer reports to: its all-time top 600, then its sitemap further down. For each skill it records the installs, and asks GitHub for its repo's stars.</p>
      <p>A skill qualifies for review once it has <strong>${n(review.minimums.installs)} installs</strong> and its repo <strong>${n(review.minimums.stars)} stars</strong>. ${n(review.under)} skills the crawl found are under that line, and ${review.waiting ? `${n(review.waiting)} qualified skills are waiting for review` : "none is waiting for review"}. Numbers are as of ${date(review.asOf)}.</p>

      <h2>2. Reviewing them</h2>
      <p>An agent reads each qualified skill's SKILL.md, its whole body and not only its description, and turns it down when browsing it would discover nothing. It turned down ${n(byAgent)} skills:</p>
      <ul>
        <li><strong>${n(t.toolDocs)} tool docs:</strong> manuals for one product, framework, cloud or language, such as a cloud's CLI or a framework's best practices. They only matter once you've chosen the product. A skill that gets a job done through a tool, such as testing, scraping or generating media, isn't tool docs.</li>
        <li><strong>${n(t.language)} not in English.</strong></li>
        <li><strong>${n(t.copy)} copies:</strong> a skill republished under another name, or listed twice, such as under its repo's old name.</li>
        <li><strong>${n(t.retired)} retired:</strong> its SKILL.md points to a replacement.</li>
        <li><strong>${n(t.other)} for other reasons:</strong> it only works inside one company's codebase or brand, does nothing for whoever installs it, or does something you wouldn't want, such as installing dozens of other skills without asking or removing the watermarks that mark images as AI-generated.</li>
      </ul>
      <p>Another ${n(review.gone)} skills are off the list because their SKILL.md is gone from their repo, and ${n(review.notOnGitHub)} because skills.sh lists them from a website rather than GitHub.</p>

      <h2>3. Describing the rest</h2>
      <p>For each skill it keeps, the agent writes:</p>
      <ul>
        <li><strong>A TLDR:</strong> what the skill does, what you end up with, when to use it and how it differs from a close neighbour.</li>
        <li><strong>Tags:</strong> what area it's for, how it works, what it needs and what it can change on its own. The <a href="${href("tags/")}">Tags</a> page explains each one.</li>
        <li><strong>A note</strong> when there's something to know before installing, such as an account it needs, what it sends to a third party, or a safety check it switches off.</li>
        <li><strong>A bundle</strong> when skills of one repo are meant to be used together, such as the steps of a workflow. SkillHub has ${n(review.bundles)}.</li>
      </ul>
      <p>Then a second agent, which hasn't seen the first one's reasoning, reads the TLDR on its own first, to see whether a stranger would understand it, and only then the SKILL.md. It fixes anything the TLDR claims that the SKILL.md doesn't say, and checks every tag against the skill's own steps.</p>

      <h2>4. Keeping it current</h2>
      <p>Every day, SkillHub fetches each listed skill's SKILL.md from its repo. When the text changes, the skill's page says how many words have changed since its TLDR was written, until an agent rewrites the TLDR. When the SKILL.md is gone, the skill comes off the list.</p>

      <h2>What to keep in mind</h2>
      <p>Agents make mistakes, and no one runs the skills to test them: a review reads the SKILL.md and judges it. Install counts come from skills.sh and stars from GitHub. Something wrong or missing? <a href="${GITHUB}/issues">Open an issue</a>.</p>
    </div>`;
}
