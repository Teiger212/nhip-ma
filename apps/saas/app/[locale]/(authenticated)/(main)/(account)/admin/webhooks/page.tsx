import { WebhookDeliveries } from "@admin/component/webhooks/WebhookDeliveries";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("admin.webhooks");
	return { title: t("title") };
}

export default function AdminWebhooksPage() {
	return <WebhookDeliveries />;
}
