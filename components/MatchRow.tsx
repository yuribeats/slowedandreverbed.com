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
  const textColor = selected ? "var(--crt-bright)" : "var(--crt-dim)";
  const artistOpacity = selected ? 0.85 : 0.7;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 border-b border-[rgba(117,204,70,0.12)] ${selected ? "crt-text" : ""}`}
      style={{
        background: selected ? "rgba(117,204,70,0.08)" : "transparent",
        fontFamily: "var(--font-crt)",
        transition: "background 0.1s, color 0.1s",
        color: textColor,
      }}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[13px] uppercase tracking-[0.05em] truncate block">
          <span style={{ opacity: artistOpacity }}>{track.artist.toUpperCase()}</span>{" "}
          {track.title.toUpperCase()}
        </span>
      </div>
      <span className="text-[12px] uppercase tracking-[0.05em] shrink-0 w-[40px] text-right">
        {track.bpm ?? "—"}
      </span>
      <span className="text-[12px] uppercase tracking-[0.05em] shrink-0 w-[70px] text-right">
        {track.key ? track.key.toUpperCase() : "—"}
      </span>
      {reason && (
        <span className="text-[11px] uppercase tracking-[0.05em] shrink-0 w-[90px] text-right hidden sm:block" style={{ opacity: 0.6 }}>
          {reason}
        </span>
      )}
    </div>
  );
}
