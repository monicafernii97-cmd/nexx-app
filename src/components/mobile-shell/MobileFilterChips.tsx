'use client';

type MobileFilterChipsProps = {
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
  ariaLabel: string;
};

export function MobileFilterChips({
  options,
  selected,
  onSelect,
  ariaLabel,
}: MobileFilterChipsProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex gap-2 pb-1">
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option)}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-sm font-medium ${
                isSelected
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 bg-white text-neutral-700 active:bg-neutral-100'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
