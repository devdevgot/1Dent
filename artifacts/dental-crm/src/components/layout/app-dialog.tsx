import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsSlashTablet } from "@/hooks/use-slash-tablet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  showClose?: boolean;
};

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  "2xl": "max-w-3xl",
} as const;

const tabletSizeClasses = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-3xl",
} as const;

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  size = "md",
  showClose = true,
}: AppDialogProps) {
  const isTablet = useIsSlashTablet();
  const widths = isTablet ? tabletSizeClasses : sizeClasses;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className={cn(
          "gap-0 overflow-hidden border-[#e8e3d9] bg-white p-0 font-manrope",
          !isTablet && [
            "max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0",
            "max-sm:rounded-t-3xl max-sm:rounded-b-none max-sm:max-h-[92vh]",
          ],
          widths[size],
          className,
        )}
      >
        <DialogHeader className="border-b border-[#e8e3d9] px-5 py-4 text-left space-y-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold text-[#0f172a] leading-tight">
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="text-xs text-[#64748b] mt-1">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
            {showClose ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="shrink-0 rounded-xl p-2 text-[#64748b] hover:bg-[#f1ede4] hover:text-[#0f172a] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </DialogHeader>

        <div className={cn("overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>

        {footer ? (
          <DialogFooter className="border-t border-[#e8e3d9] px-5 py-4 gap-2 sm:gap-2">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
