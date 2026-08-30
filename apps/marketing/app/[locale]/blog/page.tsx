import { PostListItem } from "@blog/components/PostListItem";
import { PostTagFilter } from "@blog/components/PostTagFilter";
import { getAllPosts } from "@blog/lib/posts";
import { filterPostsByTag, getTagFromSearchParam, getUniquePostTags } from "@blog/lib/tags";
import { SectionHeader } from "@home/components/SectionHeader";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "blog" });
	return {
		title: t("badge"),
		description: t("description"),
	};
}

export default async function BlogListPage(props: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ tag?: string | string[] }>;
}) {
	const { locale } = await props.params;
	const searchParams = await props.searchParams;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "blog" });
	const allPosts = await getAllPosts(locale);
	const activeTag = getTagFromSearchParam(searchParams.tag);
	const posts = filterPostsByTag(allPosts, activeTag);
	const tags = getUniquePostTags(allPosts);

	return (
		<div className="py-20 md:py-24 lg:py-28 lg:pb-40">
			<div className="container">
				<SectionHeader
					titleAs="h1"
					eyebrow={t("badge")}
					title={t("title")}
					description={t("description")}
				/>

				<PostTagFilter
					tags={tags}
					activeTag={activeTag}
					label={t("filterLabel")}
					allLabel={t("allTags")}
				/>

				{posts.length > 0 ? (
					<div className="flex flex-col divide-y divide-border/60">
						{posts.map((post) => (
							<PostListItem post={post} activeTag={activeTag} key={post.path} />
						))}
					</div>
				) : (
					<p className="text-base leading-relaxed text-foreground/55" data-test="blog-empty-filter">
						{t("emptyFilter")}
					</p>
				)}
			</div>
		</div>
	);
}
