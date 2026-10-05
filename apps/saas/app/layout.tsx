import { config } from "@config";
import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

import "./globals.css";

export const metadata: Metadata = {
	robots: {
		index: false,
		follow: false,
	},
	title: {
		default: config.appName,
		template: `%s – ${config.appName}`,
	},
	// Added to an iPhone's Home Screen, Nhịp opens as an app, where web push works (#135).
	appleWebApp: { capable: true, title: config.appName, statusBarStyle: "default" },
};

export default function RootLayout({ children }: PropsWithChildren) {
	return children;
}
