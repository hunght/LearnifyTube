import { X } from "lucide-react";
import { type Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "./data-table-view-options";

interface FilterValueObject {
  operator?: string;
  from?: unknown;
  to?: unknown;
  value?: unknown;
}

function isFilterValueObject(value: unknown): value is FilterValueObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
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
  columnFilters?: {
    [key: string]: {
      type?: "text" | "select" | "number";
      title?: string;
      options?: { label: string; value: string }[];
    };
  };
  children?: React.ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder,
  facetedFilters,
  columnFilters,
  children,
}: DataTableToolbarProps<TData>): React.JSX.Element {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchKey && (
          <Input
            placeholder={searchPlaceholder ?? "Search..."}
            value={String(table.getColumn(searchKey)?.getFilterValue() ?? "")}
            onChange={(event) => table.getColumn(searchKey)?.setFilterValue(event.target.value)}
            className="h-8 w-[150px] lg:w-[250px]"
          />
        )}
        {/* Active Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {table.getState().columnFilters.map((filter) => {
            const column = table.getColumn(filter.id);
            if (!column) return null;

            // Try to find a friendly title
            const title =
              facetedFilters?.find((f) => f.columnId === filter.id)?.title ??
              columnFilters?.[filter.id]?.title ??
              (typeof column.columnDef.header === "string" ? column.columnDef.header : filter.id);

            // Format value
            let valueDisplay = "";

            const value: unknown = filter.value;
            if (Array.isArray(value)) {
              valueDisplay = `${value.length} selected`;
            } else if (isFilterValueObject(value)) {
              if (value.operator === "between") {
                valueDisplay = `${value.from ?? "*"} - ${value.to ?? "*"}`;
              } else if (value.operator) {
                const operatorLabels: Record<string, string> = {
                  equals: "=",
                  notEquals: "!=",
                  lessThan: "<",
                  lessThanOrEqual: "<=",
                  greaterThan: ">",
                  greaterThanOrEqual: ">=",
                  empty: "empty",
                  notEmpty: "not empty",
                };
                const opLabel = operatorLabels[value.operator] ?? value.operator;
                valueDisplay = `${opLabel} ${value.value ?? ""}`;
              } else {
                valueDisplay = String(value);
              }
            } else {
              valueDisplay = String(value);
            }

            return (
              <div
                key={filter.id}
                className="hidden items-center rounded-sm border border-dashed px-2 py-1 text-xs lg:flex"
              >
                <span className="mr-2 text-muted-foreground">{title}:</span>
                <span className="max-w-[100px] truncate font-medium text-foreground">
                  {valueDisplay}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => column.setFilterValue(undefined)}
                  className="ml-1 h-4 w-4 p-0 hover:bg-transparent"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </Button>
              </div>
            );
          })}
        </div>

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        {children}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
