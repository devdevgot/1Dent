import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export function ConfirmDeleteDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-[300px] rounded-2xl bg-white border border-[#e8e3d9] shadow-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            {title ?? "Вы уверены?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {description ?? "Это действие нельзя отменить. Запись будет удалена безвозвратно."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
          <AlertDialogCancel
            onClick={onCancel}
            className="flex-1 mt-0 h-9 text-sm"
          >
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="flex-1 h-9 text-sm bg-red-500 hover:bg-red-600 text-white border-0"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
