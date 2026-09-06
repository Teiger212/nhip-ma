export type ExtractRowInput = {
	id: string;
	label: string;
	value: string;
	isEmpty: boolean;
	forceVisible?: boolean;
};

export type DisplayExtractRow = {
	id: string;
	label: string;
	value: string;
};

export function arrangeExtractRows(rows: ExtractRowInput[]): {
	visible: DisplayExtractRow[];
	collapsed: DisplayExtractRow[];
} {
	const visible: DisplayExtractRow[] = [];
	const collapsed: DisplayExtractRow[] = [];

	for (const row of rows) {
		const display = { id: row.id, label: row.label, value: row.value };
		if (row.forceVisible || !row.isEmpty) {
			visible.push(display);
		} else {
			collapsed.push(display);
		}
	}

	return { visible, collapsed };
}

export function isEmptyExtractValue(value: string, emptyLabels: readonly string[]): boolean {
	return emptyLabels.includes(value);
}
