import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { Locale } from "./copy";
import { loginCopy } from "./copy";

/**
 * The login page, located by test id so one flow works in /en and /vi alike. It offers email and
 * password only: the magic-link and passkey screens are hidden (KIT_SCREENS, #94).
 */
export class LoginPage {
	readonly email: Locator;
	readonly password: Locator;
	readonly submit: Locator;
	readonly error: Locator;
	private locale: Locale = "en";

	constructor(readonly page: Page) {
		this.email = page.getByTestId("login-email");
		this.password = page.getByTestId("login-password");
		this.submit = page.getByTestId("login-submit");
		this.error = page.getByTestId("login-error");
	}

	async goto(locale: Locale = "en") {
		this.locale = locale;
		await this.page.goto(`/${locale}/login`);
	}

	/** Fills and sends the password form; resolves once the server has answered. */
	async signIn(email: string, password: string) {
		await this.email.fill(email);
		await this.password.fill(password);
		const answered = this.page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
		await this.submit.click();
		await answered;
	}

	/**
	 * The credentials were refused: the form says they are invalid, in the page's language (not
	 * some other refusal, such as an unverified email, which would mean an account exists), and
	 * stays on the login page.
	 */
	async expectRefused() {
		await expect(this.error).toContainText(loginCopy(this.locale).invalidCredentials);
		await expect(this.page).toHaveURL(new RegExp(`/${this.locale}/login`));
	}
}
