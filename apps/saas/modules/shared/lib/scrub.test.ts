import { expect, test } from "vitest";

import {
	allowlistBrowserException,
	MAX_MESSAGE_LENGTH,
	scrubExceptionList,
	scrubServerError,
	scrubText,
	scrubUrl,
} from "./scrub";

test("phone numbers and emails never survive, in Vietnamese and international formats", () => {
	for (const phone of [
		"+84 912 345 678",
		"0912345678",
		"0912.345.678",
		"(+84) 912 345 678",
		"(028) 3822-9999",
		"+1-631-555-1181",
	]) {
		expect(scrubText(`guest ${phone} wrote`), phone).toBe("guest [phone] wrote");
	}
	expect(scrubText("from yuki.tanaka+apt@example.co.jp")).toBe("from [email]");
});

test("quoted values are blanked: error messages quote the input they choke on", () => {
	expect(scrubText('Invalid value: text: "Minji here, arriving 10pm"')).toBe(
		'Invalid value: text: "…"',
	);
});

test("record ids are removed whatever letter they start with: Prisma's cuid and the inbox's cuid2", () => {
	// Prisma's cuid() starts with "c"; the inbox's thread and message ids (cuid2, #141) are 24
	// characters starting with any letter, as in these, taken from a CI log.
	expect(scrubText("thread cm1abcdefghijklmnopqrstu failed")).toBe("thread [id] failed");
	expect(scrubText("thread ywh8noalsll0rc8icao9zu1b failed")).toBe("thread [id] failed");
	expect(scrubText("message ybfp9tewuj6hk21f9w29ft6q not found")).toBe("message [id] not found");
	// Ordinary words stay readable.
	expect(scrubText("PrismaClientKnownRequestError: Unique constraint failed")).toBe(
		"PrismaClientKnownRequestError: Unique constraint failed",
	);
});

test("long messages are capped, and a huge input is scrubbed quickly", () => {
	const scrubbed = scrubText("x ".repeat(500));
	expect(scrubbed.length).toBeLessThan(MAX_MESSAGE_LENGTH + 20);
	expect(scrubbed).toMatch(/\[truncated\]$/);
	const started = performance.now();
	scrubText("a.".repeat(100_000));
	expect(performance.now() - started).toBeLessThan(50);
});

test("URLs keep a scrubbed path and lose their query and fragment", () => {
	expect(
		scrubUrl("https://nhip-staging.vercel.app/en/signup?invitationId=abc&email=a@b.co#x"),
	).toBe("https://nhip-staging.vercel.app/en/signup");
	expect(scrubUrl("/api/conversations?locale=vi")).toBe("/api/conversations");
	expect(scrubUrl("/en/inbox/cm1abcdefghijklmnopqrstu")).toBe("/en/inbox/[id]");
	expect(scrubUrl("/en/users/a%40b.com")).toBe("/en/users/[email]");
});

test("exception lists: messages scrubbed, frame files cut to a path, source lines dropped", () => {
	expect(
		scrubExceptionList([
			{
				type: "TypeError",
				value: "cannot read 0912345678 of undefined",
				stacktrace: {
					frames: [
						{
							filename: "https://app/en/signup?invitationId=abc",
							lineno: 3,
							function: "submit",
							context_line: 'const text = "Minji";',
							pre_context: ["a"],
							post_context: ["b"],
						},
					],
				},
			},
		]),
	).toEqual([
		{
			type: "TypeError",
			value: "cannot read [phone] of undefined",
			stacktrace: {
				frames: [{ filename: "https://app/en/signup", lineno: 3, function: "submit" }],
			},
		},
	]);
});

test("the browser event is rebuilt from an allowlist; ingest's token and id pass untouched", () => {
	const token = "phc_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg";
	const distinctId = "01926f3e-8b2a-7c4d-9e1f-a2b3c4d5e6f7";
	const properties = allowlistBrowserException({
		token,
		distinct_id: distinctId,
		$lib: "web",
		$lib_version: "1.434.16",
		$pathname: "/en/inbox",
		$session_entry_url: "https://app/en/signup?invitationId=cm1abc&name=Minji",
		$initial_referrer: "https://mail.example/inbox?from=minji",
		$exception_level: "error",
		$exception_list: [{ type: "Error", value: "boom 0912345678" }],
	});
	expect(properties).toMatchObject({
		token,
		distinct_id: distinctId,
		$lib_version: "1.434.16",
		$pathname: "/en/inbox",
		$exception_list: [{ type: "Error", value: "boom [phone]" }],
		$process_person_profile: false,
		$geoip_disable: true,
	});
	expect(properties).not.toHaveProperty("$session_entry_url");
	expect(properties).not.toHaveProperty("$initial_referrer");
});

test("server errors: value-dumping errors keep only their kind, and a multi-line message makes no frames", () => {
	const prisma = new Error(
		'Invalid `prisma.message.create()` invocation:\n{ data: { text: "Minji here, I am at Ben Thanh at 0912 345 678" } }',
	);
	prisma.name = "PrismaClientValidationError";
	const scrubbedPrisma = scrubServerError(prisma);
	expect(scrubbedPrisma.message).not.toMatch(/Minji|Ben Thanh|0912/);
	expect(scrubbedPrisma.stack).not.toMatch(/Minji|Ben Thanh|0912/);

	const multiLine = new Error('Could not parse\ntext: "Minji here, at Ben Thanh"');
	const lines = scrubServerError(multiLine).stack!.split("\n");
	expect(lines.slice(1).every((line) => /^\s+at /.test(line))).toBe(true);
	expect(lines.join("\n")).not.toMatch(/Minji|Ben Thanh/);
});
