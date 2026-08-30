import React from "react";
import { Heading, Link, Text } from "react-email";
import { createTranslator } from "use-intl/core";

import PrimaryButton from "../components/PrimaryButton";
import Wrapper from "../components/Wrapper";
import { defaultLocale, defaultTranslations } from "../lib/translations";
import type { BaseMailProps } from "../types";

export function Notification({
	title,
	message,
	link,
	locale,
	translations,
}: {
	title: string;
	message?: string;
	link?: string;
} & BaseMailProps) {
	const t = createTranslator({
		locale,
		messages: {
			...translations.notification,
			common: translations.common,
		},
	});

	return (
		<Wrapper>
			<Heading className="mt-0 text-xl font-semibold">{title}</Heading>
			{message ? <Text>{message}</Text> : null}
			{link ? (
				<>
					<Text>{t("openInApp")}</Text>
					<PrimaryButton href={link}>{t("view")} &rarr;</PrimaryButton>
					<Text className="text-sm text-muted-foreground">
						{t("common.openLinkInBrowser")}
						<br />
						<Link href={link}>{link}</Link>
					</Text>
				</>
			) : null}
		</Wrapper>
	);
}

Notification.PreviewProps = {
	locale: defaultLocale,
	translations: defaultTranslations,
	title: "Example",
	message: "This is a notification email.",
	link: "https://example.com",
};

export default Notification;
