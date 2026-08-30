"use client";

import { mdxComponents } from "@blog/lib/mdx-components";
import { MDXContent } from "@content-collections/mdx/react";
import { cn } from "@repo/ui";

export function PostContent({ content, className }: { content: string; className?: string }) {
	return (
		<div className={cn("prose dark:prose-invert mt-8 max-w-2xl", className)}>
			<MDXContent
				code={content}
				components={{
					a: mdxComponents.a,
				}}
			/>
		</div>
	);
}
