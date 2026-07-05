export function schedulePlaygroundBotParts(
  parts: string[],
  pausesMs: number[] | undefined,
  onPart: (text: string) => void,
  onDone: () => void,
): () => void {
  const timeoutIds: ReturnType<typeof window.setTimeout>[] = [];
  let offset = 0;
  parts.forEach((part, index) => {
    const pause = pausesMs?.[index] ?? (index === 0 ? 0 : 900);
    offset += pause;
    const id = window.setTimeout(() => {
      onPart(part);
      if (index === parts.length - 1) onDone();
    }, offset);
    timeoutIds.push(id);
  });
  return () => {
    timeoutIds.forEach(clearTimeout);
  };
}
