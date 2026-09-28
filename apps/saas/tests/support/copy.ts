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
