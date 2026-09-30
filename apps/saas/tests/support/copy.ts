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

/** The ownership copy (ADR 0015): the Pool / Yours flags and a new agent's empty pool. */
export type OwnerCopy = {
	pool: string;
	mine: string;
	/** What an agent's Inbox says while the pool is empty and nothing is theirs. */
	emptyPool: string;
};

export function ownerCopy(locale: Locale): OwnerCopy {
	const file = path.resolve(
		__dirname,
		`../../../../packages/i18n/translations/${locale}/saas.json`,
	);
	const saas = JSON.parse(fs.readFileSync(file, "utf8")) as {
		inbox: { owner: { pool: string; mine: string }; emptyPool: string };
	};
	return {
		pool: saas.inbox.owner.pool,
		mine: saas.inbox.owner.mine,
		emptyPool: saas.inbox.emptyPool,
	};
}
