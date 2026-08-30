import { describe, expect, it } from "vitest";

import {
	filterPostsByTag,
	getBlogListHref,
	getTagFromSearchParam,
	getUniquePostTags,
	isActiveTag,
} from "./tags";

describe("getTagFromSearchParam", () => {
	it("returns a trimmed string tag", () => {
		expect(getTagFromSearchParam("  workspaces  ")).toBe("workspaces");
	});

	it("uses the first value when the param is repeated", () => {
		expect(getTagFromSearchParam(["billing", "launch"])).toBe("billing");
	});

	it("returns undefined for empty values", () => {
		expect(getTagFromSearchParam(undefined)).toBeUndefined();
		expect(getTagFromSearchParam("")).toBeUndefined();
		expect(getTagFromSearchParam("   ")).toBeUndefined();
		expect(getTagFromSearchParam([])).toBeUndefined();
	});
});

describe("getUniquePostTags", () => {
	it("returns sorted unique tags", () => {
		expect(
			getUniquePostTags([
				{ tags: ["launch", "workspaces"] },
				{ tags: ["workspaces", "billing"] },
				{ tags: [] },
			]),
		).toEqual(["billing", "launch", "workspaces"]);
	});
});

describe("filterPostsByTag", () => {
	const posts = [{ tags: ["workspaces"] }, { tags: ["billing"] }, { tags: ["Launch"] }];

	it("returns all posts when no tag is selected", () => {
		expect(filterPostsByTag(posts, undefined)).toEqual(posts);
	});

	it("matches tags case-insensitively", () => {
		expect(filterPostsByTag(posts, "launch")).toEqual([{ tags: ["Launch"] }]);
	});

	it("returns an empty list for an unknown tag", () => {
		expect(filterPostsByTag(posts, "missing")).toEqual([]);
	});
});

describe("isActiveTag", () => {
	it("compares tags case-insensitively", () => {
		expect(isActiveTag("workspaces", "Workspaces")).toBe(true);
		expect(isActiveTag("billing", "launch")).toBe(false);
		expect(isActiveTag("billing", undefined)).toBe(false);
	});
});

describe("getBlogListHref", () => {
	it("returns the unfiltered list href", () => {
		expect(getBlogListHref()).toBe("/blog");
	});

	it("encodes the tag in the query string", () => {
		expect(getBlogListHref("guest access")).toBe("/blog?tag=guest%20access");
	});
});
