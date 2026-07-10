const DEFAULT_BUBBLE_PAUSE_MS = 500;

export function schedulePlaygroundBotParts(
  parts: string[],
  pausesMs: number[] | undefined,
  onPart: (text: string) => void,
  onDone: () => void,
  options?: { immediateFirst?: boolean },
): () => void {
  const immediateFirst = options?.immediateFirst ?? false;
  let scheduleParts = parts;
  let schedulePauses = pausesMs;

  if (immediateFirst && parts.length > 0) {
    onPart(parts[0]!);
    scheduleParts = parts.slice(1);
    schedulePauses = pausesMs?.slice(1);
    if (scheduleParts.length === 0) {
      onDone();
      return () => {};
    }
  }

  const timeoutIds: ReturnType<typeof window.setTimeout>[] = [];
  let offset = 0;
  scheduleParts.forEach((part, index) => {
    const pause = schedulePauses?.[index] ?? (index === 0 ? 0 : DEFAULT_BUBBLE_PAUSE_MS);
    offset += pause;
    const id = window.setTimeout(() => {
      onPart(part);
      if (index === scheduleParts.length - 1) onDone();
    }, offset);
    timeoutIds.push(id);
  });
  return () => {
    timeoutIds.forEach(clearTimeout);
  };
}
