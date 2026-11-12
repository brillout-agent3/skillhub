import "../../account-client.ts";
import "../../list-client.ts";
import { previewRow } from "../../preview-client.ts";
import { ready } from "../../ready.ts";
import { mountRowLinks } from "../../row-links.ts";

// On a wide screen, a click on a row opens its preview rather than its page.
mountRowLinks(previewRow);
ready();
