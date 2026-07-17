import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function PinKeypad({ onDigit, onDelete, disabled, className }: PinKeypadProps) {
  return (
    <div className={cn('grid grid-cols-3 gap-3 max-w-[280px] mx-auto', className)}>
      {DIGITS.map((key, index) => {
        if (key === '') {
          return <div key={`empty-${index}`} />;
        }

        if (key === 'del') {
          return (
            <button
              key="del"
              type="button"
              disabled={disabled}
              onClick={onDelete}
              className="h-16 rounded-2xl flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] active:scale-95 transition-all disabled:opacity-40"
              aria-label="Delete"
            >
              <Delete className="w-6 h-6" />
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onDigit(key)}
            className="h-16 rounded-2xl text-2xl font-semibold text-[var(--color-text-primary)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)] active:scale-95 transition-all disabled:opacity-40"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
