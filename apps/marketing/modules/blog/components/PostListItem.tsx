"use client";

import { PostTagLink } from "@blog/components/PostTagLink";
import type { Post } from "@blog/types";
import { LocaleLink } from "@i18n/routing";
import { cn } from "@repo/ui";
import { useLocale } from "next-intl";
import Image from "next/image";

export function PostListItem({ post, activeTag }: { post: Post; activeTag?: string }) {
	const locale = useLocale();
	const { title, excerpt, authorName, image, date, path, authorImage, tags } = post;

	return (
		<article
			className={cn(
				"py-10 md:py-12",
				image &&
					"gap-6 md:grid-cols-[20rem_1fr] md:gap-10 lg:grid-cols-[24rem_1fr] grid grid-cols-1 items-start",
			)}
		>
			{image ? (
				<LocaleLink
					href={`/blog/${path}`}
					className="aspect-video relative block overflow-hidden rounded-xl border border-border/60"
				>
					<Image
						src={image}
						alt={title}
						fill
						sizes="(max-width: 768px) 100vw, (max-width: 1024px) 20rem, 24rem"
						className="object-cover object-center"
					/>
				</LocaleLink>
			) : null}

			<div>
				{tags && tags.length > 0 ? (
					<div className="mb-3 gap-2 flex flex-wrap">
						{tags.map((tag) => (
							<PostTagLink key={tag} tag={tag} activeTag={activeTag} />
						))}
					</div>
				) : null}

				<LocaleLink
					href={`/blog/${path}`}
					className="font-medium text-xl md:text-2xl tracking-tight text-pretty text-foreground transition-colors hover:text-touch"
				>
					{title}
				</LocaleLink>

				{excerpt ? (
					<p className="mt-3 text-base leading-relaxed text-pretty text-foreground/55">{excerpt}</p>
				) : null}

				<div className="mt-5 gap-3 text-sm flex items-center text-foreground/45">
					{authorName ? (
						<div className="gap-2 flex items-center">
							{authorImage ? (
								<div className="size-6 relative overflow-hidden rounded-full">
									<Image
										src={authorImage}
										alt={authorName}
										fill
										sizes="48px"
										className="object-cover object-center"
									/>
								</div>
							) : null}
							<span>{authorName}</span>
						</div>
					) : null}
					<span>{Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(date))}</span>
				</div>
			</div>
		</article>
	);
}
