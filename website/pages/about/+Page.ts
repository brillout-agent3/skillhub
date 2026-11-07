import { date, href } from "../../format.ts";
import { review } from "../../review.ts";
import { GITHUB } from "../../skills.ts";

const n = (x: number) => x.toLocaleString("en");

/**
 * About: how skills get on SkillHub, with the numbers of the latest crawl and reviews. It says what
 * a visitor can rely on, not how the work is done (which agents, how many passes, how often), which
 * may change.
 */
export default function Page(): string {
  const { turnedDown: t } = review;
  const turnedDown = t.toolDocs + t.language + t.copy + t.retired + t.other;
  return `
    <div class="page about">
      <h1>How skills get here</h1>
      <p class="lede">SkillHub lists <strong>${n(review.listed)} agent skills</strong>, out of the ${n(review.reviewed)} it reviewed: first on their installs and stars, then on whether people looking for skills would find them useful.</p>

      <h2>1. Finding skills</h2>
      <p>Skills come from <a href="https://skills.sh/">skills.sh</a>, with their installs, and their repo's stars from GitHub. A skill is read once it has <strong>${n(review.minimums.installs)} installs</strong> and its repo <strong>${n(review.minimums.stars)} stars</strong>. ${n(review.under)} skills are under that line, and ${review.waiting ? `${n(review.waiting)} are waiting to be read` : "none is waiting to be read"}. Numbers are as of ${date(review.asOf)}.</p>

      <h2>2. Reading them</h2>
      <p>The skill's whole SKILL.md is read, not only its description. ${n(turnedDown)} skills were turned down:</p>
      <ul>
        <li><strong>${n(t.toolDocs)} tool docs:</strong> manuals for one product, framework, cloud or language, such as a cloud's CLI or a framework's best practices. They only matter once you've chosen the product. A skill that gets a job done through a tool, such as testing, scraping or generating media, isn't tool docs.</li>
        <li><strong>${n(t.language)} not in English.</strong></li>
        <li><strong>${n(t.copy)} copies:</strong> a skill republished under another name, or listed twice, such as under its repo's old name.</li>
        <li><strong>${n(t.retired)} retired:</strong> its SKILL.md points to a replacement.</li>
        <li><strong>${n(t.other)} for other reasons:</strong> it only works inside one company's codebase or brand, does nothing for whoever installs it, or does something you wouldn't want, such as installing dozens of other skills without asking or removing the watermarks that mark images as AI-generated.</li>
      </ul>
      <p>Another ${n(review.gone)} skills are off the list because their SKILL.md is gone from their repo, and ${n(review.notOnGitHub)} because they aren't on GitHub.</p>

      <h2>3. Describing the rest</h2>
      <p>Each listed skill gets:</p>
      <ul>
        <li><strong>A TLDR:</strong> what the skill does, what you end up with, when to use it and how it differs from a close neighbour.</li>
        <li><strong>Tags:</strong> what area it's for, how it works, what it needs and what it can change on its own. The <a href="${href("tags/")}">Tags</a> page explains each one.</li>
        <li><strong>A note</strong> when there's something to know before installing, such as an account it needs, what it sends to a third party, or a safety check it switches off.</li>
        <li><strong>A bundle</strong> when skills of one repo are meant to be used together, such as the steps of a workflow. SkillHub has ${n(review.bundles)}.</li>
      </ul>

      <h2>4. Keeping it current</h2>
      <p>SkillHub follows each listed skill's SKILL.md in its repo. A skill's page says when its SKILL.md has changed since its TLDR was written, and a skill whose SKILL.md is gone comes off the list.</p>

      <h2>What to keep in mind</h2>
      <p>Reviews can be wrong, and no one runs the skills to test them: a review reads the SKILL.md and judges it. Install counts come from skills.sh and stars from GitHub. Something wrong or missing? <a href="${GITHUB}/issues">Open an issue</a>.</p>
    </div>`;
}
