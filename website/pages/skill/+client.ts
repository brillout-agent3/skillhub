/** A skill's page: its Save button, copy buttons, and the weekly-installs sparkline. */

import "../../account-client.ts";
import { mountCopyButtons } from "../../copy.ts";
import { mountSparklines } from "../../sparkline.ts";

mountSparklines(document);
mountCopyButtons();
