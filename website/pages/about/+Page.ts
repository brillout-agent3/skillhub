import { date, href } from "../../format.ts";
import { review } from "../../review.ts";
import { GITHUB } from "../../skills.ts";

const n = (x: number) => x.toLocaleString("en");

interface Row {
  label: string;
  count: number;
  /** The explanation the row's [i] shows. */
  tip: string;
  /** Whether the row splits the last row that isn't. */
  sub?: true;
}

/**
 * About: how skills get on SkillHub, with the numbers of the latest crawl and reviews. It says what
 * a visitor can rely on, not how the work is done (how many passes, how often), which may change.
 */
export default function Page(): string {
  const { turnedDown: t, minimums } = review;
  // Each skill SkillHub knows of is in exactly one row that isn't a sub row.
  const rows: Row[] = [
    {
      label: "Listed",
      count: review.listed,
      tip: "Judged useful to people looking for skills.",
    },
    {
      label: "Disqualified, by agent",
      count: t.toolDocs + t.language + t.copy + t.retired + t.other,
      tip: "An agent read the skill's whole SKILL.md, not only its description, and judged it not useful to people looking for skills.",
    },
    {
      label: "Tool docs",
      count: t.toolDocs,
      sub: true,
      tip: "A manual for one product, framework, cloud or language, such as a cloud's CLI or a framework's best practices. It only matters once you've chosen the product. A skill that gets a job done through a tool, such as testing, scraping or generating media, isn't tool docs.",
    },
    {
      label: "Not in English",
      count: t.language,
      sub: true,
      tip: "Its SKILL.md isn't in English.",
    },
    {
      label: "Copies",
      count: t.copy,
      sub: true,
      tip: "A skill republished under another name, or listed twice, such as under its repo's old name.",
    },
    {
      label: "Retired",
      count: t.retired,
      sub: true,
      tip: "Its SKILL.md points to a replacement.",
    },
    {
      label: "Other reasons",
      count: t.other,
      sub: true,
      tip: "It only works inside one company's codebase or brand, does nothing for whoever installs it, or does something you wouldn't want, such as installing dozens of other skills without asking or removing the watermarks that mark images as AI-generated.",
    },
    {
      label: "Disqualified, by script",
      count: review.gone + review.notOnGitHub,
      tip: "A script found the skill's SKILL.md can't be read on GitHub, without judging the skill.",
    },
    {
      label: "SKILL.md gone from its repo",
      count: review.gone,
      sub: true,
      tip: "Its repo no longer has its SKILL.md, such as after deleting or moving it. A listed skill whose SKILL.md goes comes off the list.",
    },
    {
      label: "Not on GitHub",
      count: review.notOnGitHub,
      sub: true,
      tip: "It's hosted somewhere other than GitHub, where SkillHub reads each SKILL.md and follows its changes.",
    },
    {
      label: "Under the minimum installs or stars",
      count: review.under,
      tip: `It has fewer than ${n(minimums.installs)} installs, or its repo fewer than ${n(minimums.stars)} stars. It's reviewed once it has both.`,
    },
    {
      label: "Waiting for review",
      count: review.waiting,
      tip: "It has the minimum installs and stars, and is next in line for review.",
    },
  ];
  const total: Row = {
    label: "Reviewed",
    count: review.reviewed,
    tip: "Every skill SkillHub found on skills.sh, which counts installs. Stars come from GitHub.",
  };
  const row = ({ label, count, tip, sub }: Row, i: number) =>
    `<tr${sub ? ` class="sub"` : ""}><td>${label}<span class="tip"><button type="button" class="tip-i" aria-label="About ${label}" aria-describedby="tip-${i}">i</button><span class="tip-text" role="tooltip" id="tip-${i}">${tip}</span></span></td><td class="num">${n(count)}</td></tr>`;
  return `
    <div class="page about">
      <h1>How skills get here</h1>
      <p class="lede">SkillHub lists <strong>${n(review.listed)} agent skills</strong>, out of the ${n(review.reviewed)} it reviewed: first on their installs and stars, then on whether people looking for skills would find them useful.</p>
      <table class="breakdown">
        <tbody>${rows.map(row).join("")}</tbody>
        <tfoot>${row(total, rows.length)}</tfoot>
      </table>
      <p class="breakdown-note">As of ${date(review.asOf)}.</p>

      <h2>What a listed skill gets</h2>
      <ul>
        <li><strong>A TLDR:</strong> what the skill does, what you end up with, when to use it and how it differs from a close neighbour.</li>
        <li><strong>Tags:</strong> what area it's for, how it works, what it needs and what it can change on its own. The <a href="${href("tags/")}">Tags</a> page explains each one.</li>
        <li><strong>A note</strong> when there's something to know before installing, such as an account it needs, what it sends to a third party, or a safety check it switches off.</li>
        <li><strong>A bundle</strong> when skills of one repo are meant to be used together, such as the steps of a workflow. SkillHub has ${n(review.bundles)}.</li>
      </ul>

      <h2>Keeping it current</h2>
      <p>SkillHub follows each listed skill's SKILL.md in its repo. A skill's page says when its SKILL.md has changed since its TLDR was written.</p>

      <h2>What to keep in mind</h2>
      <p>Reviews can be wrong, and no one runs the skills to test them: a review reads the SKILL.md and judges it. Install counts come from skills.sh and stars from GitHub. Something wrong or missing? <a href="${GITHUB}/issues">Open an issue</a>.</p>
    </div>`;
}
