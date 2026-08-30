import { PostTagLink } from "@blog/components/PostTagLink";
import { getBlogListHref } from "@blog/lib/tags";
import { LocaleLink } from "@i18n/routing";
import { cn } from "@repo/ui";

export function PostTagFilter({
	tags,
	activeTag,
	label,
	allLabel,
}: {
	tags: string[];
	activeTag?: string;
	label: string;
	allLabel: string;
}) {
	if (tags.length === 0) {
		return null;
	}

	const showingAll = !activeTag;

	return (
		<nav
			aria-label={label}
			data-test="blog-tag-filter"
			className="mb-8 gap-3 flex flex-wrap items-center"
		>
			<LocaleLink
				href={getBlogListHref()}
				aria-current={showingAll ? "page" : undefined}
				data-test="blog-tag-all"
				className={cn(
					"font-medium text-xs tracking-wide transition-colors",
					showingAll ? "text-foreground" : "text-touch hover:text-foreground",
				)}
			>
				{allLabel}
			</LocaleLink>
			{tags.map((tag) => (
				<PostTagLink key={tag} tag={tag} activeTag={activeTag} />
			))}
		</nav>
	);
}
