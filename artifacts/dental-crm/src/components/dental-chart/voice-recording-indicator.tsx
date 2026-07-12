import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPEECH_HOLD_MS = 90;
const CALIBRATION_MS = 700;
const BAR_COUNT = 24;

/** Symmetric idle heights — static placeholder before speech. */
const IDLE_BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const center = (BAR_COUNT - 1) / 2;
  const dist = Math.abs(i - center) / center;
  return 0.1 + (1 - dist) * 0.08;
});

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
  return Math.min(1, rms * 2.8 + peak * 0.55);
}

export function VoiceRecordingIndicator({ stream, audioContext, active, className }: Props) {
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeDomainRef = useRef<Float32Array | null>(null);
  const freqRef = useRef<Uint8Array | null>(null);

  const envelopeRef = useRef(0);
  const noiseFloorRef = useRef(0.012);
  const calibrationPeakRef = useRef(0);
  const calibrationStartedRef = useRef<number | null>(null);
  const speakingSinceRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const lastPaintRef = useRef(0);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [bars, setBars] = useState<number[]>(IDLE_BARS);

  useEffect(() => {
    if (!active || !stream || !audioContext) {
      setIsSpeaking(false);
      setBars(IDLE_BARS);
      envelopeRef.current = 0;
      noiseFloorRef.current = 0.012;
      calibrationPeakRef.current = 0;
      calibrationStartedRef.current = null;
      speakingSinceRef.current = null;
      hasSpokenRef.current = false;
      return;
    }

    let cancelled = false;

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
          const attack = 0.55;
          const release = 0.12;
          const k = raw > envelopeRef.current ? attack : release;
          envelopeRef.current = envelopeRef.current * (1 - k) + raw * k;

          if (envelopeRef.current >= threshold) {
            if (speakingSinceRef.current === null) speakingSinceRef.current = now;
          } else if (!hasSpokenRef.current) {
            speakingSinceRef.current = null;
          }

          const speakingNow =
            speakingSinceRef.current !== null && now - speakingSinceRef.current >= SPEECH_HOLD_MS;
          if (speakingNow) hasSpokenRef.current = true;
          const speaking = hasSpokenRef.current;

          if (now - lastPaintRef.current >= 24) {
            lastPaintRef.current = now;
            setIsSpeaking(speaking);

            if (speaking) {
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
              setBars(IDLE_BARS);
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Audio API unavailable — keep static idle bars.
        setBars(IDLE_BARS);
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
    };
  }, [active, stream, audioContext]);

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <div className="relative flex h-10 items-center justify-center px-1">
        <div className="flex h-full w-full items-center justify-center gap-[2px] px-0.5">
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn(
                "w-[2px] rounded-full transition-[height,opacity] duration-75 ease-out",
                isSpeaking ? "bg-[#1f75fe]" : "bg-[#94a3b8]/50",
              )}
              style={{
                height: `${Math.round(4 + h * 18)}px`,
                opacity: isSpeaking ? 0.35 + h * 0.65 : 0.45 + h * 0.35,
              }}
            />
          ))}
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-[#94a3b8]">
        {isSpeaking ? "Запись идёт" : "Ждём голос…"}
      </p>
    </div>
  );
}
