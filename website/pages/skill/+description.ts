import type { PageContextServer } from "vike/types";
import type { Data } from "./+data.ts";
import { glanceEnd } from "../../format.ts";

export default (pageContext: PageContextServer) => {
  const { tldr, description } = (pageContext.data as Data).skill.agentReview;
  return tldr?.glance.length
    ? tldr.glance.map(({ label, text }) => `${label}: ${glanceEnd(text)}`).join(" ")
    : description;
};
