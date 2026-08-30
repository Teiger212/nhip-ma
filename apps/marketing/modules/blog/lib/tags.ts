type TaggedPost = {
	tags?: string[];
};

export function getTagFromSearchParam(tag: string | string[] | undefined): string | undefined {
	const value = Array.isArray(tag) ? tag[0] : tag;
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function getUniquePostTags(posts: TaggedPost[]): string[] {
	const tags = new Set<string>();

	for (const post of posts) {
		for (const postTag of post.tags ?? []) {
			tags.add(postTag);
		}
	}

	return [...tags].sort((leftTag, rightTag) => leftTag.localeCompare(rightTag));
}

export function filterPostsByTag<PostWithTags extends TaggedPost>(
	posts: PostWithTags[],
	tag: string | undefined,
): PostWithTags[] {
	if (!tag) {
		return posts;
	}

	const normalizedTag = tag.toLowerCase();

	return posts.filter((post) =>
		post.tags?.some((postTag) => postTag.toLowerCase() === normalizedTag),
	);
}

export function isActiveTag(tag: string, activeTag: string | undefined): boolean {
	if (!activeTag) {
		return false;
	}

	return tag.toLowerCase() === activeTag.toLowerCase();
}

export function getBlogListHref(tag?: string): string {
	if (!tag) {
		return "/blog";
	}

	return `/blog?tag=${encodeURIComponent(tag)}`;
}
