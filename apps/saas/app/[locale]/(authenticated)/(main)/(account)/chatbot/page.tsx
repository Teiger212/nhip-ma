import { AiChat } from "@ai/components/AiChat";
import { PageHeader } from "@shared/components/PageHeader";
import { KIT_SCREENS } from "@shared/lib/kit-screens";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");

	return {
		title: t("aiChatbot"),
	};
}

export default async function AiDemoPage() {
	if (!KIT_SCREENS.chatbot) notFound();
	return (
		<>
			<PageHeader
				title="AI Chatbot"
				subtitle="This is an example chatbot built with the OpenAI API"
				className="max-w-3xl mx-auto"
			/>

			<AiChat />
		</>
	);
}
