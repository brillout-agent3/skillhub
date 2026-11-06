/**
 * schema.ts — generate the JSON Schemas of the data files from their TypeScript types, so that
 * editors (such as vim with a JSON language server) can complete and validate the files and show
 * the field docs. Each data file points to its schema with `$schema`. check.ts fails when a schema
 * is out of date.
 *
 * Run: pnpm run schema
 */

import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createGenerator } from "ts-json-schema-generator";
import { readJsonc, root, writeJsonc } from "./data.ts";

/** Each data file, its schema, and the type that describes it. */
export const SCHEMAS = [
  {
    data: "data/skills.jsonc",
    schema: "data/skills.schema.json",
    source: "website/types.ts",
    type: "Data",
  },
  {
    data: "data/crawl.jsonc",
    schema: "data/crawl.schema.json",
    source: "scripts/data.ts",
    type: "Crawl",
  },
];

/** The schema as it should be written: formatted the way oxfmt formats it. */
export function generate({ source, type }: (typeof SCHEMAS)[number]): string {
  const schema = createGenerator({
    path: `${root}${source}`,
    tsconfig: `${root}tsconfig.json`,
    type,
    // Only the types matter; the files' code (such as check.ts's imports) doesn't.
    skipTypeCheck: true,
    // The field docs are what make the schema worth browsing.
    jsDoc: "extended",
    // Catch typos in field names.
    additionalProperties: false,
  }).createSchema(type);
  return format(`${JSON.stringify(schema, null, 2)}\n`);
}

function format(json: string): string {
  return execFileSync(`${root}node_modules/.bin/oxfmt`, ["--stdin-filepath", "schema.json"], {
    input: json,
    encoding: "utf8",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const s of SCHEMAS) {
    writeFileSync(`${root}${s.schema}`, generate(s));
    // The `$schema` value is relative to the data file, which is next to its schema.
    const data = readJsonc<{ $schema?: string }>(`${root}${s.data}`);
    const ref = `./${s.schema.split("/").pop()}`;
    if (data.$schema !== ref)
      writeJsonc(`${root}${s.data}`, Object.assign({ $schema: ref }, data, { $schema: ref }));
    console.log(`${s.schema} written`);
  }
}
