import type { ReactNode } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
  /** Rendered in the bottom-left slot (e.g. Face ID button). */
  cornerSlot?: ReactNode;
  /** Fade the delete key when there is nothing to delete. */
  deleteVisible?: boolean;
}

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

function Key({
  children,
  onClick,
  disabled,
  ariaLabel,
  ghost,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptic('light');
        onClick();
      }}
      aria-label={ariaLabel}
      className={cn(
        'flex h-[68px] w-[68px] items-center justify-center rounded-full select-none',
        'text-[26px] font-normal text-[#0f172a] tabular-nums',
        'transition-[background-color,transform,box-shadow] duration-150 active:scale-90 disabled:opacity-35',
        ghost
          ? 'bg-transparent active:bg-[#e8e4dc]'
          : 'bg-white border border-[#e8e4dc] shadow-[0_2px_12px_rgba(15,23,42,0.06)] active:bg-[#f1ede4] active:shadow-none',
      )}
    >
      {children}
    </button>
  );
}

export function PinKeypad({
  onDigit,
  onDelete,
  disabled,
  className,
  cornerSlot,
  deleteVisible = true,
}: PinKeypadProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3.5', className)}>
      {DIGIT_ROWS.map((row) => (
        <div key={row[0]} className="flex gap-6">
          {row.map((d) => (
            <Key key={d} onClick={() => onDigit(d)} disabled={disabled}>
              {d}
            </Key>
          ))}
        </div>
      ))}

      <div className="flex gap-6">
        <div className="flex h-[68px] w-[68px] items-center justify-center">
          {cornerSlot}
        </div>
        <Key onClick={() => onDigit('0')} disabled={disabled}>
          0
        </Key>
        <div
          className={cn(
            'transition-opacity duration-200',
            deleteVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <Key onClick={onDelete} disabled={disabled} ariaLabel="Delete" ghost>
            <Delete className="h-7 w-7 text-[#64748b]" strokeWidth={1.75} />
          </Key>
        </div>
      </div>
    </div>
  );
}
