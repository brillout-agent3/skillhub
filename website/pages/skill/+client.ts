/** A skill's page: its Save button, copy buttons, the weekly-installs sparkline, and its SKILL.md's wide blocks. */

import "../../account-client.ts";
import { mountCopyButtons } from "../../copy.ts";
import { mountSparklines } from "../../sparkline.ts";
import { ready } from "../../ready.ts";
import { mountScrollables } from "../../scrollables.ts";

mountSparklines(document);
mountCopyButtons();
mountScrollables();
ready();
