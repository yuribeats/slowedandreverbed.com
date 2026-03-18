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

  const btnStyle = "tactical-button text-[9px] !px-2 !py-1";

  return (
    <div className="zone-inset mt-4">
      <div className="px-4 py-2 border-b border-[#6b6758]">
        <span className="label" style={{ margin: 0 }}>PLAYLIST</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {playlist.map((item) => (
          <div key={item.id} className="px-4 py-2 flex items-center justify-between border-b border-[#6b6758] last:border-0">
            <span className="text-[11px] uppercase tracking-wider truncate flex-1" style={{ color: "var(--crt-bright)", fontFamily: "var(--font-crt)" }}>
              {item.name}
            </span>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <span className="text-[9px] font-mono mr-2" style={{ color: "var(--crt-dim)" }}>
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
              {item.url && (
                <>
                  <button onClick={() => handlePlay(item)} className={btnStyle}>PLAY</button>
                  <button onClick={() => loadPlaylistItem(item)} className={btnStyle}>LOAD</button>
                  <button onClick={() => handleDownload(item)} className={btnStyle}>DL</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
