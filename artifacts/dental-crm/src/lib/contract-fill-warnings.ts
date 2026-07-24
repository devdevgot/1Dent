type ToastFn = ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"];

export function showContractFillWarnings(
  toast: ToastFn,
  warnings: string[] | undefined,
  successTitle?: string,
): void {
  if (!warnings?.length) {
    if (successTitle) toast({ title: successTitle });
    return;
  }

  toast({
    title: successTitle ?? "Проверьте данные договора",
    description: `Некоторые поля не заполнены:\n${warnings.slice(0, 4).join("\n")}${
      warnings.length > 4 ? `\n…и ещё ${warnings.length - 4}` : ""
    }`,
  });
}
