import { getBlogListHref, isActiveTag } from "@blog/lib/tags";
import { LocaleLink } from "@i18n/routing";
import { cn } from "@repo/ui";

export function PostTagLink({ tag, activeTag }: { tag: string; activeTag?: string }) {
	const active = isActiveTag(tag, activeTag);

	return (
		<LocaleLink
			href={active ? getBlogListHref() : getBlogListHref(tag)}
			aria-current={active ? "page" : undefined}
			className={cn(
				"font-medium text-xs tracking-wide transition-colors",
				active ? "text-foreground" : "text-touch hover:text-foreground",
			)}
		>
			{tag}
		</LocaleLink>
	);
}
