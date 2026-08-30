import { PostContent } from "@blog/components/PostContent";
import { PostTagLink } from "@blog/components/PostTagLink";
import { getPostBySlug, getPublishedPostPaths } from "@blog/lib/posts";
import { LocaleLink, localeRedirect } from "@i18n/routing";
import { getBaseUrl } from "@shared/lib/base-url";
import { getActivePathFromUrlParam } from "@shared/lib/content";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";

export function generateStaticParams() {
	const paths = getPublishedPostPaths();
	return paths.map((path) => ({ path: [path] }));
}

type Params = {
	path: string;
	locale: string;
};

export async function generateMetadata(props: { params: Promise<Params> }) {
	const { path, locale } = await props.params;
	const slug = getActivePathFromUrlParam(path);
	const post = await getPostBySlug(slug, { locale });

	return {
		title: post?.title,
		description: post?.excerpt,
		openGraph: {
			title: post?.title,
			description: post?.excerpt,
			images: post?.image
				? [
						post.image.startsWith("http")
							? post.image
							: new URL(post.image, getBaseUrl()).toString(),
					]
				: [],
		},
	};
}

export default async function BlogPostPage(props: { params: Promise<Params> }) {
	const { path, locale } = await props.params;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "blog" });

	const slug = getActivePathFromUrlParam(path);
	const post = await getPostBySlug(slug, { locale });

	if (!post) {
		return localeRedirect({ href: "/blog", locale });
	}

	const { title, date, authorName, authorImage, tags, image, body } = post;

	return (
		<div className="py-20 md:py-24 lg:py-28 lg:pb-40 container">
			<div className="mb-10">
				<LocaleLink
					href="/blog"
					className="text-sm text-foreground/50 transition-colors hover:text-touch"
				>
					&larr; {t("back")}
				</LocaleLink>
			</div>

			<div className="max-w-2xl">
				<h1 className="font-medium text-3xl md:text-4xl lg:text-[2.875rem] tracking-tight leading-[1.12] text-pretty text-foreground">
					{title}
				</h1>

				<div className="mt-5 gap-4 text-sm flex flex-wrap items-center text-foreground/50">
					{authorName && (
						<div className="gap-2 flex items-center">
							{authorImage && (
								<div className="size-7 relative overflow-hidden rounded-full">
									<Image
										src={authorImage}
										alt={authorName}
										fill
										sizes="56px"
										className="object-cover object-center"
									/>
								</div>
							)}
							<span>{authorName}</span>
						</div>
					)}

					<span>{Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(date))}</span>

					{tags && (
						<div className="gap-2 flex flex-wrap">
							{tags.map((tag) => (
								<PostTagLink key={tag} tag={tag} />
							))}
						</div>
					)}
				</div>
			</div>

			{image && (
				<div className="mt-10 max-w-3xl aspect-video relative overflow-hidden rounded-xl border border-border/60">
					<Image
						src={image}
						alt={title}
						fill
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						className="object-cover object-center"
					/>
				</div>
			)}

			<div className="pb-8">
				<PostContent content={body} />
			</div>
		</div>
	);
}
