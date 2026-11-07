import { fresh, listView } from "../../list.ts";
import { introHtml } from "../../review.ts";

export default () => introHtml() + listView(fresh("hot"));
