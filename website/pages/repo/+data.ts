import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { listingByPage } from "../../listings.ts";

export type Data = ReturnType<typeof data>;

export function data(pageContext: PageContextServer) {
  const { owner, repo } = pageContext.routeParams;
  const listing = listingByPage.get([owner, repo].map(decodeURIComponent).join("/"));
  if (!listing) throw render(404);
  return { listing };
}
