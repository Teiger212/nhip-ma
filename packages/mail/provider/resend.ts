import { Resend } from "resend";

import { config } from "../config";
import type { SendEmailHandler } from "../types";

// Created on first send, not at import: a production build loads every route, and one
// that never sends mail (the E2E build) must not need the key.
let client: Resend | undefined;
const resend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

export const send: SendEmailHandler = async ({
	to,
	from,
	subject,
	cc,
	bcc,
	replyTo,
	html,
	text,
}) => {
	// Resend reports a rejected send in `error` rather than throwing; throw it so sendEmail
	// logs it instead of treating the email as sent.
	const { error } = await resend().emails.send({
		from: from ?? config.mailFrom,
		to: [to],
		cc,
		bcc,
		replyTo,
		subject,
		html,
		text,
	});
	if (error) {
		throw new Error(`Resend refused the email: ${error.name}: ${error.message}`);
	}
};
