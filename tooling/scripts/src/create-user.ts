import { auth } from "@repo/auth";
import { createUser, createUserAccount, getUserByEmail } from "@repo/database";
import { logger } from "@repo/logs";
// The shared logger is consola/core, which cannot prompt; the full consola can.
import { consola } from "consola";
import { nanoid } from "nanoid";

async function main() {
	logger.info("Let's create a new user for your application!");

	const email = await consola.prompt("Enter an email:", {
		required: true,
		placeholder: "admin@example.com",
		type: "text",
	});

	const name = await consola.prompt("Enter a name:", {
		required: true,
		placeholder: "Adam Admin",
		type: "text",
	});

	const isAdmin = await consola.prompt("Should user be an admin?", {
		required: true,
		type: "confirm",
		default: false,
	});

	const passwordInput = (
		await consola.prompt("Enter a password:", {
			type: "text",
			placeholder: "leave blank to auto-generate",
		})
	).trim();

	const authContext = await auth.$context;
	const adminPassword = passwordInput || nanoid(16);
	const hashedPassword = await authContext.password.hash(adminPassword);

	// check if user exists
	const user = await getUserByEmail(email);

	if (user) {
		logger.error("User with this email already exists!");
		return;
	}

	const adminUser = await createUser({
		email,
		name,
		role: isAdmin ? "admin" : "user",
		emailVerified: true,
		onboardingComplete: true,
	});

	if (!adminUser) {
		logger.error("Failed to create user!");
		return;
	}

	await createUserAccount({
		userId: adminUser.id,
		providerId: "credential",
		accountId: adminUser.id,
		hashedPassword,
	});

	logger.success("User created successfully!");

	if (!passwordInput) {
		logger.info(`Here is the password for the new user: ${adminPassword}`);
	}
}

main().catch(console.error);
