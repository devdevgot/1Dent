import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPEECH_HOLD_MS = 90;
const CALIBRATION_MS = 700;
const BAR_COUNT = 24;

type Props = {
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  active: boolean;
  className?: string;
};

function measureLevel(data: Float32Array): number {
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / data.length);
  // Peak reacts faster to consonants; RMS keeps body of speech visible.
  return Math.min(1, rms * 2.8 + peak * 0.55);
}

export function VoiceRecordingIndicator({ stream, audioContext, active, className }: Props) {
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeDomainRef = useRef<Float32Array | null>(null);
  const freqRef = useRef<Uint8Array | null>(null);

  const crawlRef = useRef(0);
  const envelopeRef = useRef(0);
  const noiseFloorRef = useRef(0.012);
  const calibrationPeakRef = useRef(0);
  const calibrationStartedRef = useRef<number | null>(null);
  const speakingSinceRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const positionRef = useRef(0.08);
  const lastPaintRef = useRef(0);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [crawlPos, setCrawlPos] = useState(0.08);
  const [dotPos, setDotPos] = useState(0.08);
  const [dotScale, setDotScale] = useState(1);
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0.08));

  useEffect(() => {
    if (!active || !stream || !audioContext) {
      setIsSpeaking(false);
      setCrawlPos(0.08);
      setDotPos(0.08);
      setDotScale(1);
      setBars(Array(BAR_COUNT).fill(0.08));
      crawlRef.current = 0.08;
      envelopeRef.current = 0;
      noiseFloorRef.current = 0.012;
      calibrationPeakRef.current = 0;
      calibrationStartedRef.current = null;
      speakingSinceRef.current = null;
      hasSpokenRef.current = false;
      positionRef.current = 0.08;
      return;
    }

    let cancelled = false;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const setup = async () => {
      try {
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        if (cancelled) return;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.45;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        sourceRef.current = source;
        analyserRef.current = analyser;
        timeDomainRef.current = new Float32Array(analyser.fftSize);
        freqRef.current = new Uint8Array(analyser.frequencyBinCount);
        calibrationStartedRef.current = performance.now();

        const tick = (now: number) => {
          if (cancelled || !analyserRef.current || !timeDomainRef.current || !freqRef.current) return;

          if (audioContext.state === "suspended") {
            void audioContext.resume();
          }

          analyserRef.current.getFloatTimeDomainData(timeDomainRef.current);
          analyserRef.current.getByteFrequencyData(freqRef.current);

          const raw = measureLevel(timeDomainRef.current);

          if (calibrationStartedRef.current !== null && now - calibrationStartedRef.current < CALIBRATION_MS) {
            calibrationPeakRef.current = Math.max(calibrationPeakRef.current, raw);
            noiseFloorRef.current = Math.max(0.006, calibrationPeakRef.current * 1.35 + 0.004);
          } else {
            calibrationStartedRef.current = null;
          }

          const threshold = noiseFloorRef.current * 2.2 + 0.006;

          // Fast attack, slower release — indicator feels responsive but not jittery.
          const attack = 0.55;
          const release = 0.12;
          const k = raw > envelopeRef.current ? attack : release;
          envelopeRef.current = envelopeRef.current * (1 - k) + raw * k;
          const above = Math.max(0, envelopeRef.current - threshold);

          if (envelopeRef.current >= threshold) {
            if (speakingSinceRef.current === null) speakingSinceRef.current = now;
          } else if (!hasSpokenRef.current) {
            speakingSinceRef.current = null;
          }

          const speakingNow =
            speakingSinceRef.current !== null && now - speakingSinceRef.current >= SPEECH_HOLD_MS;
          if (speakingNow) hasSpokenRef.current = true;
          const speaking = hasSpokenRef.current;

          if (!speaking) {
            crawlRef.current = crawlRef.current >= 0.92 ? 0.08 : crawlRef.current + 0.0016;
          } else {
            const span = Math.max(0.05, 0.42 - noiseFloorRef.current);
            const mapped = Math.min(1, Math.pow(above / span, 0.65));
            positionRef.current = positionRef.current * 0.72 + mapped * 0.28;
          }

          if (now - lastPaintRef.current >= 24) {
            lastPaintRef.current = now;
            setIsSpeaking(speaking);

            if (speaking) {
              const pos = 0.08 + positionRef.current * 0.84;
              setDotPos(pos);
              setDotScale(1 + positionRef.current * 0.75);

              const nextBars: number[] = [];
              const slice = Math.max(1, Math.floor(freqRef.current.length / BAR_COUNT));
              for (let i = 0; i < BAR_COUNT; i++) {
                let peak = 0;
                const start = i * slice;
                const end = Math.min(freqRef.current.length, start + slice);
                for (let j = start; j < end; j++) {
                  peak = Math.max(peak, freqRef.current[j] / 255);
                }
                nextBars.push(0.12 + peak * 0.88);
              }
              setBars(nextBars);
            } else {
              setCrawlPos(crawlRef.current);
              setDotPos(0.08);
              setDotScale(1);
              setBars(Array(BAR_COUNT).fill(0.12));
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        fallbackInterval = setInterval(() => {
          if (cancelled || hasSpokenRef.current) return;
          crawlRef.current = crawlRef.current >= 0.92 ? 0.08 : crawlRef.current + 0.02;
          setCrawlPos(crawlRef.current);
        }, 48);
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
    };
  }, [active, stream, audioContext]);

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <div className="relative h-10 flex items-center px-1">
        <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-[#e8e3d9]" />

        {isSpeaking ? (
          <div className="relative z-[1] flex h-full w-full items-center justify-center gap-[2px] px-0.5">
            {bars.map((h, i) => (
              <span
                key={i}
                className="w-[2px] rounded-full bg-[#1f75fe] transition-[height,opacity] duration-75 ease-out"
                style={{
                  height: `${Math.round(4 + h * 18)}px`,
                  opacity: 0.35 + h * 0.65,
                }}
              />
            ))}
          </div>
        ) : (
          <div
            className="absolute h-1.5 w-1.5 rounded-full bg-[#1f75fe] transition-[left] duration-100 ease-linear"
            style={{
              top: "50%",
              left: `${crawlPos * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}

        {isSpeaking && (
          <div
            className="pointer-events-none absolute z-[2] h-2 w-2 rounded-full bg-[#1f75fe] transition-[left,transform] duration-75 ease-out"
            style={{
              top: "50%",
              left: `${dotPos * 100}%`,
              transform: `translate(-50%, -50%) scale(${dotScale})`,
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
