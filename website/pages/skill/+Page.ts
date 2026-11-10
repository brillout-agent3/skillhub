import type { PageContextServer } from "vike/types";
import { age, commandHtml, date, esc } from "../../format.ts";
import { skillsLink } from "../../list.ts";
import { statTilesHtml } from "../../stat-tiles.ts";
import { copyButton } from "../../copy.ts";
import {
  FACET_ORDER,
  bundleHref,
  bundleOf,
  crumbsHtml,
  data,
  facetById,
  facetOf,
  glanceHtml,
  publishedOf,
  repoHref,
  repoKey,
  short,
  skillById,
  skillHref,
  starsOf,
  tagChip,
  tagInfo,
  tagsOf,
  tldrHtml,
} from "../../skills.ts";
import type { Skill, SkillMd } from "../../../data/types.ts";
import { github } from "../../github.ts";
import { saveButton, saveKey } from "../../saves.ts";
import { fullBundleById } from "../../server-data.ts";
import type { Data } from "./+data.ts";

/** The command that installs the skill, as skills.sh gives it: the skills CLI's --skill ignores case. */
const installCommand = (s: Skill) =>
  `npx skills add https://github.com/${github(s).repo} --skill ${s.name}`;

/** Where the copy of the SKILL.md came from. */
function source(s: Skill, { version }: SkillMd): string {
  const gh = github(s);
  return `<a href="https://github.com/${esc(gh.repo)}/blob/${version}/${esc(encodeURI(gh.dir ? `${gh.dir}/SKILL.md` : "SKILL.md"))}">${esc(gh.repo)} at ${short(version)}</a>`;
}

/** Its numbers, a tile each: see stat-tiles.ts. */
function tiles(s: Skill): string {
  const sh = s["skills.sh"];
  const week = sh.weeklyInstalls?.[sh.weeklyInstalls.length - 1] ?? null;
  const stars = starsOf(s);
  const published = publishedOf(s);
  return statTilesHtml(s, [
    {
      p: "week",
      label: "Weekly Downloads",
      from: `week to ${date(data.asOf.installs)}`,
      shown: week?.toLocaleString("en") ?? "",
      trend: sh.weeklyInstalls,
    },
    {
      p: "downloads",
      label: "Total Downloads",
      from: "on skills.sh",
      shown: sh.installs?.toLocaleString("en") ?? "",
    },
    {
      p: "stars",
      label: "Repo stars",
      from: esc(repoKey(s)),
      shown: stars?.toLocaleString("en") ?? "",
    },
    {
      p: "published",
      label: "Age",
      from: published ? `published ${date(published)}` : "",
      shown: published ? age(published, data.asOf.installs) : "",
    },
  ]);
}

function tagTable(s: Skill): string {
  const byFacet = new Map<string, string[]>();
  for (const t of tagsOf(s)) byFacet.set(facetOf(t), [...(byFacet.get(facetOf(t)) ?? []), t]);
  const rows = FACET_ORDER.filter((f) => byFacet.has(f)).map((f) => {
    const tags = byFacet.get(f) ?? [];
    const explained = f === "topic" || f === "stack" ? [] : tags.filter((t) => tagInfo.has(t));
    return `
      <tr>
        <th scope="row">${esc(facetById.get(f)?.name ?? f)}</th>
        <td>
          <div class="tags">${tags.map((t) => tagChip(t, skillsLink({ tags: [t] }))).join("")}</div>
          ${explained.map((t) => `<p class="tag-meaning">${esc(tagInfo.get(t) ?? "")}</p>`).join("")}
        </td>
      </tr>`;
  });
  return `<table class="tag-detail">${rows.join("")}</table>`;
}

/** Where the skill sits in its bundle, with the skills before and after it. */
function inBundle(s: Skill): string {
  const place = bundleOf.get(s.id);
  if (!place) return "";
  const { bundle, index, standalone } = place;
  const note = fullBundleById.get(bundle.id)?.agentReview.skills[index]?.note;
  const link = (i: number) => {
    const id = bundle.agentReview.skills[i]?.id;
    return id ? `<a href="${skillHref(id)}">${esc(skillById.get(id)?.name ?? id)}</a>` : "";
  };
  // Such as ", after brainstorming and before executing-plans".
  const near = [
    link(index - 1) && `after ${link(index - 1)}`,
    link(index + 1) && `before ${link(index + 1)}`,
  ].filter(Boolean);
  return `
    <p class="in-bundle">Skill ${index + 1} of ${bundle.agentReview.skills.length} in the <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a> bundle${near.length ? `, ${near.join(" and ")}` : ""}.</p>
    ${standalone ? "" : `<p class="note">Only works inside its bundle: ${esc(note ?? "")} Install <a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a> instead.</p>`}`;
}

export default function Page(pageContext: PageContextServer): string {
  const { skill: s, copy } = pageContext.data as Data;
  const gh = github(s);
  const sh = s["skills.sh"];
  const state = s.skillMd;
  const links = [
    `<a href="${esc(sh.url)}">skills.sh page</a>`,
    `<a href="https://github.com/${esc(gh.repo)}${gh.dir ? `/tree/HEAD/${esc(encodeURI(gh.dir))}` : ""}">Source on GitHub</a>`,
    `<a href="${repoHref(repoKey(s))}">All skills from ${esc(repoKey(s))}</a>`,
  ];
  const bundle = bundleOf.get(s.id)?.bundle;
  return `
    <div class="page skill-page">
      ${crumbsHtml(repoKey(s), ...(bundle ? [`<a href="${bundleHref(bundle.id)}">${esc(bundle.agentReview.name)}</a>`] : []))}
      <div class="title-row"><h1>${esc(s.name)}</h1>${saveButton(saveKey("skill", s.id), s.name)}</div>
      ${
        s.agentReview.tldr?.glance.length
          ? `<section class="at-a-glance" aria-label="At a glance">${glanceHtml(s.agentReview.tldr.glance)}</section>`
          : `<p class="lede">${esc(s.agentReview.description)}</p>`
      }
      ${inBundle(s)}
      ${s.agentReview.note ? `<p class="note">${esc(s.agentReview.note)}</p>` : ""}
      ${s.agentReview.tldr ? tldrHtml(s.agentReview.tldr, "the skill", s.skillMd?.skew ?? 0) : ""}
      <div class="get">
        <div class="install"><code>${commandHtml(installCommand(s))}</code>${copyButton(installCommand(s))}</div>
        <p class="links">${links.join("")}</p>
      </div>
      ${tiles(s)}
      ${tagTable(s)}
      <section class="skill-md" aria-labelledby="skill-md">
        <h2 id="skill-md">SKILL.md</h2>
        ${
          copy && state
            ? `<p class="muted">From ${source(s, state)}. Checked daily, last changed ${date(state.updated)}.</p>
        ${copy.frontmatter ? `<details class="frontmatter"><summary>Frontmatter</summary><pre><code>${esc(copy.frontmatter)}</code></pre></details>` : ""}
        <div class="markdown">${copy.html}</div>`
            : `<p class="muted">No copy of its SKILL.md yet.</p>`
        }
      </section>
    </div>`;
}
