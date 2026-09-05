import { InboxShell } from "@inbox/components/InboxShell";
import type { PropsWithChildren } from "react";

export default function InboxLayout({ children }: PropsWithChildren) {
	return <InboxShell>{children}</InboxShell>;
}
