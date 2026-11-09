import { data, idPath } from "../../skills.ts";
import { skillPage } from "../../github.ts";

/** One page per skill. */
export const onBeforePrerenderStart = () => data.skills.map((s) => `/${idPath(skillPage(s))}/`);
