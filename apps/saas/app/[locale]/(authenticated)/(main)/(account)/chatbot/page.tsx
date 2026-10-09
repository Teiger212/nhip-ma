import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");

	return {
		title: t("aiChatbot"),
	};
}

/**
 * The kit's AI chat demo, kept but off (`KIT_SCREENS.chatbot`, off). Its oRPC route (`ai`) is no longer
 * mounted in `packages/api/orpc/router.ts`, so the page does not render `AiChat`; turning the screen
 * on means mounting the router again and rendering `AiChat` here.
 */
export default async function AiDemoPage() {
	notFound();
}
