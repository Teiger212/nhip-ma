import React, { type PropsWithChildren } from "react";
import { Button } from "react-email";

export default function PrimaryButton({
	href,
	children,
}: PropsWithChildren<{
	href: string;
}>) {
	return (
		<Button
			href={href}
			className="px-5 py-2.5 text-base rounded-full bg-primary text-primary-foreground"
		>
			{children}
		</Button>
	);
}
