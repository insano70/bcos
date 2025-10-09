'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Multi-Select Field Component
 * Allows selection of multiple options from a dropdown
 */

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFieldProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxSelections?: number;
  error?: string;
  disabled?: boolean;
}

export function MultiSelectField({
  options,
  value,
  onChange,
  placeholder = 'Select options...',
  maxSelections = 100,
  error,
  disabled = false,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter((opt) => value.includes(opt.value));
  const availableOptions = options.filter((opt) => !value.includes(opt.value));

  const handleSelect = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      if (value.length >= maxSelections) {
        return;
      }
      onChange([...value, optionValue]);
    }
  };

  const handleRemove = (optionValue: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange([]);
  };

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  return (
    <div ref={containerRef} className="w-full space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={`w-full justify-between ${error ? 'border-destructive' : ''}`}
          >
            <div className="flex flex-1 flex-wrap gap-1">
              {selectedOptions.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selectedOptions.map((option) => (
                  <Badge
                    key={option.value}
                    variant="secondary"
                    className="mr-1 flex items-center gap-1"
                  >
                    {option.label}
                    {!disabled && (
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={(e) => handleRemove(option.value, e)}
                      />
                    )}
                  </Badge>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedOptions.length > 0 && !disabled && (
                <X
                  className="h-4 w-4 cursor-pointer opacity-50 hover:opacity-100"
                  onClick={handleClear}
                />
              )}
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search options..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {availableOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${value.includes(option.value) ? 'opacity-100' : 'opacity-0'}`}
                    />
                    {option.label}
                  </CommandItem>
                ))}
                {selectedOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-100" />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {value.length} of {maxSelections} selected
        </p>
      )}
    </div>
  );
}
