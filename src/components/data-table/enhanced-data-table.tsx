import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type OnChangeFn,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTableAdvancedFilter } from "./data-table-advanced-filter";
import { cn } from "@/lib/utils";

interface EnhancedDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  facetedFilters?: {
    columnId: string;
    title: string;
    options: {
      label: string;
      value: string;
      icon?: React.ComponentType<{ className?: string }>;
    }[];
  }[];
  enableColumnResize?: boolean;
  enableHeaderFilters?: boolean;
  columnFilters?: {
    [key: string]: {
      type?: "text" | "select" | "number";
      title?: string;
      options?: { label: string; value: string }[];
    };
  };
  // Controlled state
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  // Row ID function
  getRowId?: (originalRow: TData, index: number) => string;
  // Row interactions
  onRowDoubleClick?: (row: TData) => void;
  // Toolbar custom actions
  toolbarActions?: React.ReactNode;
  // Loading state
  isLoading?: boolean;
  // Empty state message
  emptyMessage?: string;
}

export function EnhancedDataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  facetedFilters,
  enableColumnResize = true,
  enableHeaderFilters = true,
  columnFilters = {},
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledOnRowSelectionChange,
  getRowId,
  onRowDoubleClick,
  toolbarActions,
  isLoading,
  emptyMessage = "No results.",
}: EnhancedDataTableProps<TData, TValue>): React.JSX.Element {
  const [internalRowSelection, setInternalRowSelection] = React.useState({});
  const rowSelection = controlledRowSelection ?? internalRowSelection;
  const setRowSelection = controlledOnRowSelectionChange ?? setInternalRowSelection;

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFiltersState, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters: columnFiltersState,
      globalFilter,
      columnSizing,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableColumnResizing: enableColumnResize,
    columnResizeMode: "onChange",
    defaultColumn: {
      minSize: 50,
      maxSize: 800,
      size: 150,
    },
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchKey={searchKey}
        searchPlaceholder={searchPlaceholder}
        facetedFilters={facetedFilters}
        columnFilters={columnFilters}
      >
        {toolbarActions}
      </DataTableToolbar>
      <div className="overflow-hidden rounded-md border">
        <div className="max-h-[60vh] min-h-[400px] w-full overflow-x-auto">
          <Table
            style={{
              width: "100%",
              minWidth: table.getTotalSize(),
              tableLayout: "fixed",
            }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const filterConfig = columnFilters[header.column.id];
                    const canFilter = enableHeaderFilters && filterConfig;

                    return (
                      <TableHead
                        key={header.id}
                        className="group relative p-2"
                        style={{
                          width: header.getSize(),
                          position: "relative",
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          {/* Column header with sort */}
                          <div className="min-w-0 flex-1">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </div>

                          {/* Column filter */}
                          {canFilter && (
                            <DataTableAdvancedFilter
                              column={header.column}
                              title={filterConfig.title}
                              options={filterConfig.options}
                              filterType={filterConfig.type ?? "text"}
                            />
                          )}
                        </div>

                        {/* Resize handle */}
                        {enableColumnResize && header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={cn(
                              "absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none bg-border/30 transition-colors hover:bg-primary/50 group-hover:bg-border",
                              header.column.getIsResizing() && "bg-primary opacity-100",
                              "after:absolute after:bottom-2 after:right-0 after:top-2 after:w-[1px] after:bg-border"
                            )}
                            style={{
                              userSelect: "none",
                              touchAction: "none",
                            }}
                          />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={columns.length} className="p-2">
                      <div className="h-10 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onDoubleClick={() => onRowDoubleClick?.(row.original)}
                    className={onRowDoubleClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="whitespace-normal break-words p-2"
                        style={{
                          width: cell.column.getSize(),
                          wordBreak: "break-word",
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
