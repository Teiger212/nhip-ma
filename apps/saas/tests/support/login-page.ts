import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { Locale } from "./copy";
import { loginCopy } from "./copy";

export type LoginMode = "password" | "magic-link";

/** The login page, located by test id so one flow works in /en and /vi alike. */
export class LoginPage {
	readonly email: Locator;
	readonly password: Locator;
	readonly submit: Locator;
	readonly error: Locator;
	readonly linkSent: Locator;
	private locale: Locale = "en";

	constructor(readonly page: Page) {
		this.email = page.getByTestId("login-email");
		this.password = page.getByTestId("login-password");
		this.submit = page.getByTestId("login-submit");
		this.error = page.getByTestId("login-error");
		this.linkSent = page.getByTestId("login-link-sent");
	}

	async goto(locale: Locale = "en") {
		this.locale = locale;
		await this.page.goto(`/${locale}/login`);
	}

	async switchMode(mode: LoginMode) {
		await this.page.getByTestId(`login-mode-${mode}`).click();
	}

	/** Fills and sends the password form; resolves once the server has answered. */
	async signIn(email: string, password: string) {
		await this.switchMode("password");
		await this.email.fill(email);
		await this.password.fill(password);
		const answered = this.page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
		await this.submit.click();
		await answered;
	}

	/** Asks for a magic link; the page confirms it was sent. */
	async requestMagicLink(email: string) {
		await this.switchMode("magic-link");
		await this.email.fill(email);
		await this.submit.click();
		await expect(this.linkSent).toBeVisible();
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
