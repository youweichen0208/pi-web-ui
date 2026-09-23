import { querySqlite } from "./sqlite-query.js";

process.once("message", (request: { absolute: string; table?: string; offset: number }) => {
	try { process.send?.({ data: querySqlite(request.absolute, request.table, request.offset) }); }
	catch (error) { process.send?.({ error: (error as Error).message }); }
	finally { process.disconnect(); }
});
