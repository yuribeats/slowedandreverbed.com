"use client";

import { matchReason } from "../lib/camelot";

export interface MatchTrack {
  artist: string;
  title: string;
  bpm: number | null;
  key: string | null;
  noteIndex: number | null;
  mode: "major" | "minor" | null;
  popularity: number;
}

interface Props {
  track: MatchTrack;
  sourceKey: string;
  selected: boolean;
  onClick: () => void;
}

export default function MatchRow({ track, sourceKey, selected, onClick }: Props) {
  const reason = track.key ? matchReason(sourceKey, track.key) : "";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,0,0,0.15)]"
      style={{
        background: selected ? "rgba(117,204,70,0.15)" : "transparent",
        fontFamily: "var(--font-tech)",
        transition: "background 0.1s",
      }}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[12px] uppercase tracking-[0.05em] truncate block" style={{ color: "var(--text-dark)" }}>
          <span style={{ opacity: 0.6 }}>{track.artist}</span> {track.title}
        </span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.05em] shrink-0 w-[40px] text-right" style={{ color: "var(--text-dark)", opacity: 0.6 }}>
        {track.bpm ?? "—"}
      </span>
      <span className="text-[11px] uppercase tracking-[0.05em] shrink-0 w-[70px] text-right" style={{ color: "var(--text-dark)" }}>
        {track.key ? track.key.toUpperCase() : "—"}
      </span>
      {reason && (
        <span className="text-[10px] uppercase tracking-[0.05em] shrink-0 w-[90px] text-right hidden sm:block" style={{ color: "var(--text-dark)", opacity: 0.4 }}>
          {reason}
        </span>
      )}
    </div>
  );
}
