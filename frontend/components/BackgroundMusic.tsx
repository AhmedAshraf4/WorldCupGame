"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const MUSIC_SRC = "/assets/bg.mp3";
const MUSIC_VOLUME = 0.35;

export function BackgroundMusic() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio(MUSIC_SRC);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = MUSIC_VOLUME;
      audioRef.current = audio;
    }

    const audio = audioRef.current;
    const shouldPlay = pathname !== "/login";
    let removedUnlockListeners = false;

    function removeUnlockListeners() {
      if (removedUnlockListeners) return;

      document.removeEventListener("pointerdown", unlockAudio, true);
      document.removeEventListener("touchstart", unlockAudio, true);
      document.removeEventListener("click", unlockAudio, true);
      document.removeEventListener("keydown", unlockAudio, true);
      removedUnlockListeners = true;
    }

    async function tryPlay() {
      if (!shouldPlay) return;

      try {
        await audio.play();
        removeUnlockListeners();
      } catch {
        document.addEventListener("pointerdown", unlockAudio, true);
        document.addEventListener("touchstart", unlockAudio, true);
        document.addEventListener("click", unlockAudio, true);
        document.addEventListener("keydown", unlockAudio, true);
      }
    }

    function unlockAudio() {
      void tryPlay();
    }

    if (!shouldPlay) {
      audio.pause();
      return removeUnlockListeners;
    }

    void tryPlay();

    return removeUnlockListeners;
  }, [pathname]);

  return null;
}
