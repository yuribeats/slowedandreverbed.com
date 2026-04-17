"use client";

import { camelotCode, matchReason } from "../lib/camelot";

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
  const cam = track.key ? camelotCode(track.key) : "";
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
          {track.artist} — {track.title}
        </span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.05em] shrink-0 w-[40px] text-right" style={{ color: "var(--text-dark)", opacity: 0.6 }}>
        {track.bpm ?? "—"}
      </span>
      <span className="text-[11px] uppercase tracking-[0.05em] shrink-0 w-[70px] text-right" style={{ color: "var(--text-dark)" }}>
        {track.key ? track.key.toUpperCase() : "—"}
      </span>
      <span className="text-[10px] uppercase tracking-[0.05em] shrink-0 w-[24px] text-center" style={{ color: "var(--crt-dim)", fontFamily: "var(--font-crt)" }}>
        {cam}
      </span>
      {reason && (
        <span className="text-[9px] uppercase tracking-[0.05em] shrink-0 w-[80px] text-right hidden sm:block" style={{ color: "var(--text-dark)", opacity: 0.4 }}>
          {reason}
        </span>
      )}
    </div>
  );
}
