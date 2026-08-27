"use client";

import { useEffect, useRef, useState } from "react";

export default function AudioButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.addEventListener("ended", () => setPlaying(false));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Jeda audio / Pause audio" : "Putar pelafalan / Play pronunciation"}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-contrast shadow transition hover:opacity-90"
    >
      {playing ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <rect x="3" y="2" width="4" height="12" rx="1" />
          <rect x="9" y="2" width="4" height="12" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M4 2.5v11l9-5.5-9-5.5z" />
        </svg>
      )}
    </button>
  );
}
