// The header's Log in, or your avatar and Log out, on every page. A page with a +client.ts of its own
// replaces this one, so it imports account-client.ts too, and calls ready() last.
import "../account-client.ts";
import { ready } from "../ready.ts";

ready();
