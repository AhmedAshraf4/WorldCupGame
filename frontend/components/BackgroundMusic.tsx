"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const MUSIC_SRC = "/assets/bg.mp3";
const MUSIC_VOLUME = 0.35;
const MUSIC_START_TIME_SECONDS = 2 * 60;

export function BackgroundMusic() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio(MUSIC_SRC);
      audio.loop = false;
      audio.preload = "auto";
      audio.volume = MUSIC_VOLUME;
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = Math.min(MUSIC_START_TIME_SECONDS, audio.duration);
        },
        { once: true },
      );
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
        if (
          audio.readyState >= HTMLMediaElement.HAVE_METADATA &&
          audio.currentTime < MUSIC_START_TIME_SECONDS
        ) {
          audio.currentTime = Math.min(MUSIC_START_TIME_SECONDS, audio.duration);
        }
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
