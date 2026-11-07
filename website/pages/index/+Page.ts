import { fresh, listView } from "../../list.ts";
import { introHtml } from "../../review.ts";

/** Top: the skills list, unfiltered; ../../list-client.ts applies the filters in the URL. */
export default () => introHtml() + listView(fresh("top"));
