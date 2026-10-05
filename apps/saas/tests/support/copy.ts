import fs from "node:fs";
import path from "node:path";

export type Locale = "en" | "vi";

/** The login copy each language ships (packages/i18n/translations/<locale>/saas.json). */
export type LoginCopy = {
	title: string;
	submit: string;
	modes: { password: string; magicLink: string };
	password: string;
	/** The refusal for a wrong email or password. */
	invalidCredentials: string;
};

export function loginCopy(locale: Locale): LoginCopy {
	const file = path.resolve(
		__dirname,
		`../../../../packages/i18n/translations/${locale}/saas.json`,
	);
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		auth: {
			login: Omit<LoginCopy, "password" | "invalidCredentials">;
			signup: { password: string };
			errors: { invalidEmailOrPassword: string };
		};
	};
	return {
		...saas.auth.login,
		password: saas.auth.signup.password,
		invalidCredentials: saas.auth.errors.invalidEmailOrPassword,
	};
}

/** The pipe-connection copy (ADR 0017): the admin's Connections card and the inbox's blocked send. */
export type PipeCopy = {
	status: { none: string; connected: string; needsReconnect: string };
	connectZalo: string;
	disconnectTitle: string;
	/** The reason a thread on a disconnected pipe cannot be sent. */
	sendBlocked: (pipe: string) => string;
	/** The inbox banner while a pipe of the office is disconnected. */
	banner: (pipes: string) => string;
};

export function pipeCopy(locale: Locale): PipeCopy {
	const file = path.resolve(
		__dirname,
		`../../../../packages/i18n/translations/${locale}/saas.json`,
	);
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		admin: {
			connections: {
				status: PipeCopy["status"];
				connectZalo: string;
				confirmDisconnect: { title: string };
			};
		};
		inbox: {
			pipeDisconnected: string;
			pipeDisconnectedBanner: string;
		};
	};
	const { connections } = saas.admin;
	return {
		status: connections.status,
		connectZalo: connections.connectZalo,
		disconnectTitle: connections.confirmDisconnect.title,
		sendBlocked: (pipe) => saas.inbox.pipeDisconnected.replaceAll("{pipe}", pipe),
		banner: (pipes) => saas.inbox.pipeDisconnectedBanner.replaceAll("{pipes}", pipes),
	};
}

/**
 * The ownership copy (ADR 0022): the Unassigned / Yours flags, the managers' "Assign to…" control
 * and owner filter, and an agent's Inbox with nothing assigned.
 */
export type OwnerCopy = {
	/** A thread with no owner. */
	unassigned: string;
	/** The viewer's own thread. */
	mine: string;
	/** The name of the thread header's owner control (managers only). */
	assignTo: string;
	/** The label of the managers' owner filter. */
	filter: string;
	/** The owner filter's every-thread option. */
	allThreads: string;
	/** What an agent's Inbox says while nothing is assigned to them. */
	emptyAssigned: string;
};

export function ownerCopy(locale: Locale): OwnerCopy {
	const file = path.resolve(
		__dirname,
		`../../../../packages/i18n/translations/${locale}/saas.json`,
	);
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		inbox: {
			owner: { unassigned: string; mine: string; assignTo: string; filter: string; all: string };
			emptyAssigned: string;
		};
	};
	const { owner } = saas.inbox;
	return {
		unassigned: owner.unassigned,
		mine: owner.mine,
		assignTo: owner.assignTo,
		filter: owner.filter,
		allThreads: owner.all,
		emptyAssigned: saas.inbox.emptyAssigned,
	};
}
