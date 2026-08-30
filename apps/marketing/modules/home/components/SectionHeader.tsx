import { cn } from "@repo/ui";
import type { ReactNode } from "react";

export function SectionEyebrow({
	children,
	align = "start",
	className,
}: {
	children: ReactNode;
	align?: "start" | "center";
	className?: string;
}) {
	return (
		<p
			className={cn(
				"mb-4 gap-2 font-medium text-sm tracking-wide flex items-center text-touch",
				align === "center" && "justify-center",
				className,
			)}
		>
			<span className="size-1.5 rounded-full bg-touch" aria-hidden />
			{children}
		</p>
	);
}

export function SectionHeader({
	eyebrow,
	title,
	description,
	align = "start",
	titleAs = "h2",
	className,
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	align?: "start" | "center";
	titleAs?: "h1" | "h2";
	className?: string;
}) {
	const TitleTag = titleAs;

	return (
		<div
			className={cn(
				"mb-16 lg:mb-24 max-w-3xl",
				align === "center" && "mx-auto text-center",
				className,
			)}
		>
			{eyebrow ? <SectionEyebrow align={align}>{eyebrow}</SectionEyebrow> : null}
			<TitleTag
				className={cn(
					"font-medium text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.12] text-foreground",
					align === "center" ? "text-balance" : "text-pretty",
				)}
			>
				{title}
			</TitleTag>
			{description ? (
				<p
					className={cn(
						"text-base lg:text-lg mt-5 leading-relaxed text-foreground/55",
						align === "center" ? "text-balance" : "text-pretty",
					)}
				>
					{description}
				</p>
			) : null}
		</div>
	);
}
