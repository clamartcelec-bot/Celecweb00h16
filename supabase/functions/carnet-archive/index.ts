import { handleArchive } from "./handler.ts";

Deno.serve((req: Request) => handleArchive(req));
