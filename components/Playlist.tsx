"use client";

import { useStore } from "../lib/store";

export default function Playlist() {
  const playlist = useStore((s) => s.playlist);
  const loadPlaylistItem = useStore((s) => s.loadPlaylistItem);

  if (playlist.length === 0) return null;

  return (
    <div className="bg-gradient-to-b from-[#3a3a3e] to-[#2a2a2e] border border-[#1a1a1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="px-4 py-2 border-b border-[#1a1a1a]">
        <span className="text-[10px] text-dw-muted uppercase tracking-[0.15em]">
          PLAYLIST
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {playlist.map((item) => (
          <button
            key={item.id}
            onClick={() => loadPlaylistItem(item)}
            disabled={!item.url}
            className="w-full px-4 py-2 flex items-center justify-between border-b border-[#1a1a1a] last:border-0 hover:bg-[#333] disabled:opacity-40 disabled:hover:bg-transparent text-left"
          >
            <span className="text-[11px] text-dw-text font-mono uppercase tracking-wider truncate">
              {item.name}
            </span>
            <span className="text-[9px] text-dw-muted font-mono ml-4 flex-shrink-0">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
