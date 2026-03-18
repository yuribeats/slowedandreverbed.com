"use client";

import { useEffect } from "react";
import { useStore } from "../lib/store";

export default function Playlist() {
  const playlist = useStore((s) => s.playlist);
  const loadPlaylistItem = useStore((s) => s.loadPlaylistItem);
  const fetchPlaylist = useStore((s) => s.fetchPlaylist);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  if (playlist.length === 0) return null;

  const handlePlay = (item: (typeof playlist)[0]) => {
    loadPlaylistItem(item);
    setTimeout(() => {
      useStore.getState().play();
    }, 500);
  };

  const handleDownload = (item: (typeof playlist)[0]) => {
    if (!item.url) return;
    const a = document.createElement("a");
    a.href = item.url;
    a.download = `${item.name}.wav`;
    a.click();
  };

  const btnStyle =
    "text-[8px] uppercase tracking-[0.05em] font-mono px-2 py-1 border border-dw-btn-border text-dw-muted hover:text-dw-vfd-teal hover:border-dw-vfd-teal";

  return (
    <div className="border-t border-dw-panel-border">
      <div className="px-4 py-2 border-b border-dw-panel-border">
        <span className="text-[9px] text-dw-muted uppercase tracking-[0.05em] font-mono font-medium">
          PLAYLIST
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {playlist.map((item) => (
          <div
            key={item.id}
            className="px-4 py-2 flex items-center justify-between border-b border-dw-panel-border last:border-0"
          >
            <span className="text-[10px] text-dw-text font-mono uppercase tracking-wider truncate flex-1">
              {item.name}
            </span>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <span className="text-[8px] text-dw-muted font-mono mr-2">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
              {item.url && (
                <>
                  <button onClick={() => handlePlay(item)} className={btnStyle}>
                    PLAY
                  </button>
                  <button onClick={() => loadPlaylistItem(item)} className={btnStyle}>
                    LOAD
                  </button>
                  <button onClick={() => handleDownload(item)} className={btnStyle}>
                    DL
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
