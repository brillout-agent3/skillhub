import type { PageContextServer } from "vike/types";
import { github } from "../../github.ts";
import type { Data } from "./+data.ts";

/**
 * With its repo: some seventy skills share their name with another's, such as the five named
 * deep-research, and their tabs, history entries and bookmarks all read the same.
 */
export default (pageContext: PageContextServer) => {
  const { skill } = pageContext.data as Data;
  return `${skill.name} · ${github(skill).repo} · SkillHub`;
};
