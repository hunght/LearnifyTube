import * as React from "react";
import { Check, ListFilter, Search } from "lucide-react";
import { type Column } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataTableAdvancedFilterProps<TData, TValue> {
  column: Column<TData, TValue>;
  title?: string;
  options?: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  filterType?: "text" | "select" | "number";
}

type NumberFilterOperator =
  | "equals"
  | "notEquals"
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "between"
  | "empty"
  | "notEmpty";

interface NumberFilterValue {
  operator: NumberFilterOperator;
  value?: number;
  from?: number;
  to?: number;
}

export function DataTableAdvancedFilter<TData, TValue>({
  column,
  title,
  options,
  filterType = "text",
}: DataTableAdvancedFilterProps<TData, TValue>): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const filterValue = column.getFilterValue();

  // Handle faceted/select filter state
  const selectedValues = React.useMemo(() => {
    if (filterType !== "select") return new Set<string>();
    if (Array.isArray(filterValue)) {
      return new Set<string>(filterValue.map(String));
    }
    return new Set<string>();
  }, [filterValue, filterType]);

  // Handle text filter state
  const [textValue, setTextValue] = React.useState<string>(
    filterType === "text" && typeof filterValue === "string" ? filterValue : ""
  );

  // Handle number filter state
  const [numberOperator, setNumberOperator] = React.useState<NumberFilterOperator>("equals");
  const [numberValue, setNumberValue] = React.useState<string>("");
  const [numberFrom, setNumberFrom] = React.useState<string>("");
  const [numberTo, setNumberTo] = React.useState<string>("");

  // Debounce refs
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Sync internal state with column filter value when opened
  React.useEffect(() => {
    if (open) {
      const currentValue = column.getFilterValue();
      if (filterType === "text") {
        setTextValue(typeof currentValue === "string" ? currentValue : "");
      } else if (filterType === "number") {
        const isNumberFilter = (v: unknown): v is NumberFilterValue =>
          typeof v === "object" && v !== null && "operator" in v;
        if (isNumberFilter(currentValue)) {
          setNumberOperator(currentValue.operator);
          setNumberValue(currentValue.value?.toString() ?? "");
          setNumberFrom(currentValue.from?.toString() ?? "");
          setNumberTo(currentValue.to?.toString() ?? "");
        } else {
          setNumberOperator("equals");
          setNumberValue("");
          setNumberFrom("");
          setNumberTo("");
        }
      }
    }
  }, [open, column, filterType]);

  const hasFilter = React.useMemo(() => {
    if (filterType === "select") return selectedValues.size > 0;
    if (filterType === "number") {
      return column.getFilterValue() !== undefined;
    }
    return !!filterValue;
  }, [filterType, selectedValues, filterValue, column]);

  // Calculate unique values for select filter
  const computedOptions = React.useMemo(() => {
    if (options) return options;
    if (filterType === "select") {
      const uniqueValues = column.getFacetedUniqueValues();
      return Array.from(uniqueValues.keys())
        .sort()
        .slice(0, 100)
        .map((value) => ({
          label: String(value),
          value: String(value),
          icon: undefined,
        }));
    }
    return [];
  }, [column, options, filterType]);

  const handleTextFilterChange = (value: string): void => {
    setTextValue(value);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the filter update (300ms delay)
    debounceTimerRef.current = setTimeout(() => {
      column.setFilterValue(value || undefined);
    }, 300);
  };

  const handleNumberFilterChange = (
    op: NumberFilterOperator,
    val?: string,
    from?: string,
    to?: string
  ): void => {
    setNumberOperator(op);
    if (val !== undefined) setNumberValue(val);
    if (from !== undefined) setNumberFrom(from);
    if (to !== undefined) setNumberTo(to);

    const v = val !== undefined ? val : numberValue;
    const f = from !== undefined ? from : numberFrom;
    const t = to !== undefined ? to : numberTo;

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the filter update (300ms delay)
    debounceTimerRef.current = setTimeout(() => {
      // Construct filter value object
      if (op === "empty" || op === "notEmpty") {
        column.setFilterValue({ operator: op });
        return;
      }

      if (op === "between") {
        if (f === "" && t === "") {
          column.setFilterValue(undefined);
          return;
        }
        column.setFilterValue({
          operator: op,
          from: f === "" ? undefined : Number(f),
          to: t === "" ? undefined : Number(t),
        });
        return;
      }

      if (v === "") {
        column.setFilterValue(undefined);
        return;
      }

      column.setFilterValue({
        operator: op,
        value: Number(v),
      });
    }, 300);
  };

  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return computedOptions;
    return computedOptions.filter((option) =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [computedOptions, searchTerm]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 w-8 p-0 data-[state=open]:bg-accent",
            hasFilter && "bg-accent text-primary"
          )}
        >
          <ListFilter className="h-4 w-4" />
          <span className="sr-only">Filter</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        {filterType === "select" ? (
          <div className="flex flex-col">
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder={`Search ${title ?? ""}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              />
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="p-1">
                {filteredOptions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No results found
                  </div>
                ) : (
                  filteredOptions.map((option) => {
                    const isSelected = selectedValues.has(option.value);
                    return (
                      <div
                        key={option.value}
                        className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => {
                          if (isSelected) {
                            selectedValues.delete(option.value);
                          } else {
                            selectedValues.add(option.value);
                          }
                          const filterValues = Array.from(selectedValues);
                          column.setFilterValue(filterValues.length ? filterValues : undefined);
                        }}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className={cn("h-4 w-4")} />
                        </div>
                        {option.icon && (
                          <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="truncate">{option.label}</span>
                        {column.getFacetedUniqueValues().get(option.value) && (
                          <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                            {column.getFacetedUniqueValues().get(option.value)}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            {selectedValues.size > 0 && (
              <div className="border-t p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-xs"
                  onClick={() => column.setFilterValue(undefined)}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        ) : filterType === "number" ? (
          <div className="space-y-3 p-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Filter by {title}</Label>
              <Select
                value={numberOperator}
                onValueChange={(val: NumberFilterOperator) => handleNumberFilterChange(val)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="notEquals">Not equals</SelectItem>
                  <SelectItem value="greaterThan">Greater than</SelectItem>
                  <SelectItem value="greaterThanOrEqual">Greater than or equal</SelectItem>
                  <SelectItem value="lessThan">Less than</SelectItem>
                  <SelectItem value="lessThanOrEqual">Less than or equal</SelectItem>
                  <SelectItem value="between">Between</SelectItem>
                  <SelectItem value="empty">Empty</SelectItem>
                  <SelectItem value="notEmpty">Not empty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {numberOperator === "between" ? (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="From"
                  type="number"
                  value={numberFrom}
                  onChange={(e) =>
                    handleNumberFilterChange(numberOperator, undefined, e.target.value, undefined)
                  }
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="To"
                  type="number"
                  value={numberTo}
                  onChange={(e) =>
                    handleNumberFilterChange(numberOperator, undefined, undefined, e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
            ) : (
              numberOperator !== "empty" &&
              numberOperator !== "notEmpty" && (
                <Input
                  placeholder="Value"
                  type="number"
                  value={numberValue}
                  onChange={(e) => handleNumberFilterChange(numberOperator, e.target.value)}
                  className="h-8 text-xs"
                />
              )
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center px-2 text-xs"
              onClick={() => {
                setNumberValue("");
                setNumberFrom("");
                setNumberTo("");
                setNumberOperator("equals");
                column.setFilterValue(undefined);
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Filter by {title}</Label>
              <Input
                placeholder="Search..."
                value={textValue}
                onChange={(e) => handleTextFilterChange(e.target.value)}
                className="h-8"
                autoFocus
              />
            </div>
            {textValue && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-center px-2 text-xs"
                onClick={() => handleTextFilterChange("")}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
