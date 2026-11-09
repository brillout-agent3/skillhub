import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { listingsByOwner } from "../../listings.ts";

export type Data = ReturnType<typeof data>;

export function data(pageContext: PageContextServer) {
  const listings = listingsByOwner.get(decodeURIComponent(pageContext.routeParams.owner));
  if (!listings) throw render(404);
  // As its most starred repo spells it: the ids spell some owners two ways.
  return { owner: listings[0].repo.id.split("/")[0], listings };
}
