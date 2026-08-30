import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from "@tanstack/react-table";

export const clientDataTableFeatures = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	rowSortingFeature,
	rowPaginationFeature,
	filteredRowModel: createFilteredRowModel(),
	sortedRowModel: createSortedRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
});

export const manualPaginationTableFeatures = tableFeatures({
	columnVisibilityFeature,
	rowPaginationFeature,
	paginatedRowModel: createPaginatedRowModel(),
});
