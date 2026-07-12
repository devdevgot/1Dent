import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPEECH_THRESHOLD = 0.06;
const SPEECH_HOLD_MS = 120;

type Props = {
  stream: MediaStream | null;
  active: boolean;
  className?: string;
};

function rmsFromTimeDomain(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

export function VoiceRecordingIndicator({ stream, active, className }: Props) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeDomainRef = useRef<Uint8Array | null>(null);
  const crawlRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const speakingSinceRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const lastPaintRef = useRef(0);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [crawlPos, setCrawlPos] = useState(0);
  const [dotPos, setDotPos] = useState(0);
  const [dotScale, setDotScale] = useState(1);

  useEffect(() => {
    if (!active || !stream) {
      setIsSpeaking(false);
      setCrawlPos(0);
      setDotPos(0);
      setDotScale(1);
      crawlRef.current = 0;
      smoothedLevelRef.current = 0;
      speakingSinceRef.current = null;
      hasSpokenRef.current = false;
      return;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        const ctx = new AudioContext();
        if (cancelled) {
          void ctx.close();
          return;
        }
        if (ctx.state === "suspended") await ctx.resume();

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.82;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioCtxRef.current = ctx;
        sourceRef.current = source;
        analyserRef.current = analyser;
        timeDomainRef.current = new Uint8Array(analyser.fftSize);

        const tick = (now: number) => {
          if (cancelled || !analyserRef.current || !timeDomainRef.current) return;

          analyserRef.current.getByteTimeDomainData(timeDomainRef.current);

          const raw = rmsFromTimeDomain(timeDomainRef.current);
          smoothedLevelRef.current = smoothedLevelRef.current * 0.72 + raw * 0.28;
          const smoothed = smoothedLevelRef.current;

          if (smoothed >= SPEECH_THRESHOLD) {
            if (speakingSinceRef.current === null) speakingSinceRef.current = now;
          } else {
            speakingSinceRef.current = null;
          }

          const speakingNow =
            speakingSinceRef.current !== null && now - speakingSinceRef.current >= SPEECH_HOLD_MS;
          if (speakingNow) hasSpokenRef.current = true;
          const speaking = hasSpokenRef.current;

          if (!speaking) {
            crawlRef.current = (crawlRef.current + 0.0028) % 1;
          }

          if (now - lastPaintRef.current >= 32) {
            lastPaintRef.current = now;
            setIsSpeaking(speaking);
            if (speaking) {
              const mapped = Math.min(1, Math.max(0, (smoothed - SPEECH_THRESHOLD) / 0.35));
              setDotPos(mapped);
              setDotScale(1 + mapped * 0.6);
            } else {
              setCrawlPos(crawlRef.current);
              setDotPos(0);
              setDotScale(1);
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Microphone visualizer is optional — recording still works without it.
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, [active, stream]);

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <div className="relative h-8 flex items-center px-1">
        <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-[#e8e3d9]" />

        <div
          className={cn(
            "absolute rounded-full bg-primary",
            isSpeaking ? "h-2 w-2 transition-[left,transform] duration-75 ease-out" : "h-1.5 w-1.5 transition-[left] duration-100 ease-linear",
          )}
          style={{
            top: "50%",
            left: `${(isSpeaking ? dotPos : crawlPos) * 100}%`,
            transform: `translate(-50%, -50%) scale(${isSpeaking ? dotScale : 1})`,
          }}
        />

        {isSpeaking && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary/10 transition-[left,width] duration-75 ease-out"
            style={{
              left: `${dotPos * 100}%`,
              width: `${8 + dotScale * 10}px`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}
      </div>

      <p className="mt-2 text-center text-[10px] text-[#94a3b8]">
        {isSpeaking ? "Запись идёт" : "Ждём голос…"}
      </p>
    </div>
  );
}
