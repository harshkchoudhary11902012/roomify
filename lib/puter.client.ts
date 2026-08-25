/**
 * Browser-only Puter SDK entry.
 * Keep Puter out of the SSR bundle — initializing it on the server
 * causes socket.io session storms (400 Bad Request) after login.
 */
export { puter } from "@heyputer/puter.js";
