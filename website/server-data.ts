/**
 * The data with all of its fields, for pages, which render on the server. skills.ts types the
 * same data as the browser's trimmed copy (client-data.ts), because the browser runs it too; a
 * page that shows what the copy leaves out, such as a skill's SKILL.md version or a bundle's
 * install commands, gets its skill or bundle from here. The client build refuses to import this
 * file: see the jsonc plugin of pages/+config.ts.
 */

import raw from "../data/skills.jsonc";
import type { Data } from "../data/types.ts";
import { skillPage } from "./github.ts";

export const serverData = raw as Data;
export const fullSkillById = new Map(serverData.skills.map((s) => [s.id, s]));
export const fullSkillByPage = new Map(serverData.skills.map((s) => [skillPage(s), s]));
export const fullRepoById = new Map(serverData.repos.map((r) => [r.id, r]));
export const fullBundleById = new Map(serverData.bundles.map((b) => [b.id, b]));
