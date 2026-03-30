"use client";

import { create } from "zustand";

export interface RadioTrack {
  id: string;
  url: string;
  artist: string;
  title: string;
}

interface RadioState {
  queue: RadioTrack[];
  currentIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  playAll: (tracks: RadioTrack[]) => void;
  play: (track: RadioTrack, queue?: RadioTrack[]) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const useRadioStore = create<RadioState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  shuffle: true,

  playAll: (tracks) => {
    const shuffled = shuffleArray(tracks);
    set({ queue: shuffled, currentIndex: 0, isPlaying: true });
  },

  play: (track, queue) => {
    if (queue) {
      const idx = queue.findIndex((t) => t.id === track.id);
      set({ queue, currentIndex: idx >= 0 ? idx : 0, isPlaying: true });
    } else {
      const { queue: q } = get();
      const idx = q.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        set({ currentIndex: idx, isPlaying: true });
      } else {
        set({ queue: [track], currentIndex: 0, isPlaying: true });
      }
    }
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  next: () => {
    const { queue, currentIndex, shuffle } = get();
    if (queue.length === 0) return;
    if (shuffle) {
      const next = Math.floor(Math.random() * queue.length);
      set({ currentIndex: next, isPlaying: true });
    } else if (currentIndex < queue.length - 1) {
      set({ currentIndex: currentIndex + 1, isPlaying: true });
    } else {
      set({ currentIndex: 0, isPlaying: true });
    }
  },

  prev: () => {
    const { queue, currentIndex } = get();
    if (queue.length === 0) return;
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1, isPlaying: true });
    } else {
      set({ currentIndex: queue.length - 1, isPlaying: true });
    }
  },

  close: () => set({ queue: [], currentIndex: -1, isPlaying: false }),
}));
