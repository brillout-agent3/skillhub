import type { PageContextServer } from "vike/types";
import { plural } from "../../format.ts";
import type { Data } from "./+data.ts";

export default (pageContext: PageContextServer) => {
  const { repo, skills } = (pageContext.data as Data).listing;
  const what = `The ${plural(skills.length, "agent skill")} of ${repo.id} on GitHub.`;
  return repo.agentReview.description ? `${what} ${repo.agentReview.description}` : what;
};
