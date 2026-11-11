/** A skill's page: its Save button, copy buttons, and the weekly-installs sparkline. */

import "../../account-client.ts";
import { mountCopyButtons } from "../../copy.ts";
import { mountSparklines } from "../../sparkline.ts";
import { ready } from "../../ready.ts";

mountSparklines(document);
mountCopyButtons();
ready();
