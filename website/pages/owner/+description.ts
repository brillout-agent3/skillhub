import type { PageContextServer } from "vike/types";
import { plural } from "../../format.ts";
import type { Data } from "./+data.ts";

export default (pageContext: PageContextServer) => {
  const { owner, listings } = pageContext.data as Data;
  const skills = listings.reduce((n, l) => n + l.skills.length, 0);
  return `The ${plural(skills, "agent skill")} of ${owner} on GitHub, from ${listings.map((l) => l.repo.id).join(", ")}.`;
};
