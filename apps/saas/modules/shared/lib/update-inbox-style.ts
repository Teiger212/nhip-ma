"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { INBOX_STYLE_COOKIE, resolveInboxStyle } from "./inbox-style";

export async function updateInboxStyle(value: string) {
	(await cookies()).set(INBOX_STYLE_COOKIE, resolveInboxStyle(value), {
		path: "/",
		sameSite: "lax",
		maxAge: 60 * 60 * 24 * 30,
	});
	revalidatePath("/");
}
