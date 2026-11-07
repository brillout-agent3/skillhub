import { brandHtml } from "../../brand.ts";
import { fresh, listView } from "../../list.ts";
import { introHtml } from "../../review.ts";

/** The skills list, unfiltered; ../../list-client.ts applies the settings and filters in the URL. */
export default () => listView(fresh(), introHtml(), brandHtml());
