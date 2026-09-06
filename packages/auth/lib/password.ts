/**
 * Better Auth's default password hasher, exposed without importing the full
 * `@repo/auth` server module. Scripts (e.g. the walk-user seed) run under `tsx`
 * in CommonJS mode, and the full module pulls in ESM-only UI dependencies
 * through mail templates.
 */
export { hashPassword, verifyPassword } from "better-auth/crypto";
