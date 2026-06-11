export function schedulePlaygroundBotParts(
  parts: string[],
  pausesMs: number[] | undefined,
  onPart: (text: string) => void,
  onDone: () => void,
): void {
  let offset = 0;
  parts.forEach((part, index) => {
    const pause = pausesMs?.[index] ?? (index === 0 ? 0 : 900);
    offset += pause;
    window.setTimeout(() => {
      onPart(part);
      if (index === parts.length - 1) onDone();
    }, offset);
  });
}
