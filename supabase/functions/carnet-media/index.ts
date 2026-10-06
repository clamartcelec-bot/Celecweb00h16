// verify_jwt is disabled on purpose: the handler performs the Auth.getUser check
// and returns structured v1 errors (401/403) that the Android client expects.
import { handleMedia } from "./handler.ts";
Deno.serve(handleMedia);
