import type { PageContextServer } from "vike/types";
import { bundleRepo } from "../../github.ts";
import type { Data } from "./+data.ts";

/** As a skill's, with its repo, and what it is: the Caveman bundle beside the caveman skill. */
export default (pageContext: PageContextServer) => {
  const { bundle } = pageContext.data as Data;
  return `${bundle.agentReview.name} · bundle of ${bundleRepo(bundle)} · SkillHub`;
};
