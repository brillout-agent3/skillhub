import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { fullBundleByPage } from "../../server-data.ts";

export type Data = ReturnType<typeof data>;

export function data(pageContext: PageContextServer) {
  const page = decodeURIComponent(pageContext.routeParams["*"]).replace(/\/$/, "");
  const bundle = fullBundleByPage.get(`bundle/${page}`);
  if (!bundle) throw render(404);
  return { bundle };
}
