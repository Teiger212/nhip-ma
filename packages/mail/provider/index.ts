import type { SendEmailHandler } from "../types";
import { send as logEmail } from "./console";
import { send as sendWithResend } from "./resend";

/** The E2E run (E2E=1) never sends real mail; it logs each email instead (AGENTS.md). */
export const send: SendEmailHandler = (params) =>
	process.env.E2E === "1" ? logEmail(params) : sendWithResend(params);
