"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

async function extractVideoFrame(url: string): Promise<Blob> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("VIDEO LOAD FAILED")), { once: true });
  });
  video.currentTime = 0.1;
  await new Promise<void>((resolve) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
  });
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("FRAME EXTRACT FAILED"))), "image/png");
  });
}

interface GalleryItem {
  id: string;
  cid: string;
  url: string;
  artist: string;
  title: string;
  createdAt: string;
  youtubeUrl?: string | null;
}

interface PinataFile {
  id: string;
  cid: string;
  name: string;
  size: number;
  mimeType: string | null;
  url: string;
  type: string | null;
  artist: string | null;
  title: string | null;
  createdAt: string;
}

interface PlaylistTrack {
  videoId: string;
  title: string;
  status: "pending" | "downloading" | "done" | "error";
  error?: string;
}

const textStyle: React.CSSProperties = { fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, color: "#000" };
const PAGE_SIZE = 12;

function LazyVideo({ src, onError }: { src: string; onError: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full aspect-square" style={{ background: "#000" }}>
      {visible && (
        <video
          src={src}
          controls
          preload="metadata"
          className="w-full h-full object-cover"
          onError={onError}
        />
      )}
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense>
      <GalleryContent />
    </Suspense>
  );
}

function GalleryContent() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("automash_yt_uploads") || "{}"); } catch { return {}; }
  });

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [playlistFetching, setPlaylistFetching] = useState(false);
  const [playlistDownloading, setPlaylistDownloading] = useState(false);
  const [playlistProgress, setPlaylistProgress] = useState({ current: 0, total: 0 });
  const [playlistError, setPlaylistError] = useState("");

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [allFiles, setAllFiles] = useState<PinataFile[]>([]);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const LAST_DL_KEY = "automash_last_download";

  async function downloadFiles(files: PinataFile[]) {
    setDownloading(true);
    setDownloadProgress({ current: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      setDownloadProgress({ current: i + 1, total: files.length });
      try {
        const res = await fetch(files[i].url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const ext = files[i].mimeType?.includes("video") ? ".mp4" : files[i].mimeType?.includes("audio") ? ".mp3" : "";
        a.download = (files[i].name || files[i].cid) + ext;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 500));
      } catch {}
    }
    localStorage.setItem(LAST_DL_KEY, new Date().toISOString());
    setDownloading(false);
  }

  function getNewFiles(): PinataFile[] {
    const last = localStorage.getItem(LAST_DL_KEY);
    if (!last) return allFiles;
    const lastDate = new Date(last).getTime();
    return allFiles.filter((f) => new Date(f.createdAt).getTime() > lastDate);
  }

  // inprocess.world minting state
  interface InprocessSession { token: string; wallet: string; username: string; email: string; ts: number }
  interface InprocessCollection { name: string; address: string }
  const [ipSession, setIpSession] = useState<InprocessSession | null>(null);
  const [ipEmail, setIpEmail] = useState("");
  const [ipCode, setIpCode] = useState("");
  const [ipAuthStep, setIpAuthStep] = useState<"email" | "code" | "done">("email");
  const [ipAuthLoading, setIpAuthLoading] = useState(false);
  const [ipAuthError, setIpAuthError] = useState("");
  const [ipCollections, setIpCollections] = useState<InprocessCollection[]>([]);
  const [ipSelectedCollection, setIpSelectedCollection] = useState<InprocessCollection | null>(null);
  const [ipMintState, setIpMintState] = useState<Record<string, string>>({});
  const [ipMintResult, setIpMintResult] = useState<Record<string, string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("automash_mints") || "{}") as Record<string, string>;
      // Strip any stale non-MINTED entries so a prior session can't park the UI in a
      // stuck VERIFYING / parse-error state across reloads.
      const cleaned: Record<string, string> = {};
      let changed = false;
      for (const [k, v] of Object.entries(raw)) {
        if (v === "MINTED") cleaned[k] = v;
        else changed = true;
      }
      if (changed) localStorage.setItem("automash_mints", JSON.stringify(cleaned));
      return cleaned;
    } catch { return {}; }
  });
  const [showInprocess, setShowInprocess] = useState(false);
  const SESSION_KEY = "automash_inprocess_session";
  // Keep the session as long as possible on the client — the server token decides actual validity.
  // If a request later 401s we clear the session and re-prompt. 365 days covers the realistic upper bound.
  const SESSION_TTL = 365 * 24 * 60 * 60 * 1000;

  const syncOnChainMints = useCallback(async (): Promise<Set<string>> => {
    try {
      const res = await fetch("/api/inprocess/minted-items?collection=0x60fc593f063e1be321d305889d2c4119a0cabaa6");
      const data = await res.json();
      const mintedNames = new Set<string>((data.names ?? []).map((n: string) => n.toLowerCase().trim()));
      setIpMintResult((prev) => {
        const next = { ...prev };
        let changed = false;
        items.forEach((item) => {
          const combined = `${item.artist} - ${item.title}`.toLowerCase().trim();
          const current = next[item.id];
          if (mintedNames.has(combined)) {
            if (current !== "MINTED") { next[item.id] = "MINTED"; changed = true; }
          } else if (current && (/setupnewtoken|userophash|verifying/i.test(current))) {
            // Stuck parse-error string or "VERIFYING ON-CHAIN" from a previous run —
            // on-chain confirms not minted, so clear and let the MINT button return.
            delete next[item.id];
            changed = true;
          }
        });
        if (changed) localStorage.setItem("automash_mints", JSON.stringify(next));
        return changed ? next : prev;
      });
      return mintedNames;
    } catch {
      return new Set();
    }
  }, [items]);

  // Sync mint flags from on-chain data
  useEffect(() => {
    if (items.length === 0) return;
    syncOnChainMints();
  }, [items.length, syncOnChainMints]);

  // Restore session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as InprocessSession;
        if (Date.now() - s.ts < SESSION_TTL) {
          setIpSession(s);
          setIpAuthStep("done");
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {}
  }, []);

  // Fetch collections when session is available
  useEffect(() => {
    if (!ipSession) return;
    fetch(`/api/inprocess/collections?wallet=${encodeURIComponent(ipSession.wallet)}`)
      .then(async (r) => {
        if (r.status === 401) {
          try { localStorage.removeItem(SESSION_KEY); } catch {}
          setIpSession(null);
          setIpAuthStep("email");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const cols = data.collections ?? [];
        setIpCollections(cols);
        if (cols.length > 0) setIpSelectedCollection(cols[0]);
      })
      .catch(() => {});
  }, [ipSession]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ipSendCode() {
    if (!ipEmail.trim()) return;
    setIpAuthLoading(true);
    setIpAuthError("");
    try {
      const res = await fetch("/api/inprocess/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ipEmail.trim() }),
      });
      if (!res.ok) throw new Error("FAILED TO SEND CODE");
      setIpAuthStep("code");
    } catch (e) {
      setIpAuthError(e instanceof Error ? e.message : "ERROR");
    }
    setIpAuthLoading(false);
  }

  async function ipVerifyCode() {
    if (!ipCode.trim()) return;
    setIpAuthLoading(true);
    setIpAuthError("");
    try {
      const res = await fetch("/api/inprocess/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ipEmail.trim(), code: ipCode.trim() }),
      });
      if (!res.ok) throw new Error("INVALID CODE");
      const data = await res.json();
      const token = data.token || data.apiKey || data.access_token;
      if (!token) throw new Error("NO TOKEN RETURNED");

      // Get profile
      const profileRes = await fetch("/api/inprocess/auth/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!profileRes.ok) throw new Error("PROFILE FETCH FAILED");
      const profile = await profileRes.json();

      const session: InprocessSession = {
        token,
        wallet: profile.artistAddress || profile.wallet || "",
        username: profile.profile?.username || ipEmail.split("@")[0],
        email: ipEmail.trim(),
        ts: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setIpSession(session);
      setIpAuthStep("done");
    } catch (e) {
      setIpAuthError(e instanceof Error ? e.message : "LOGIN FAILED");
    }
    setIpAuthLoading(false);
  }

  function ipLogout() {
    localStorage.removeItem(SESSION_KEY);
    setIpSession(null);
    setIpAuthStep("email");
    setIpCode("");
    setIpCollections([]);
    setIpSelectedCollection(null);
  }

  const clearIpSession = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setIpSession(null);
    setIpAuthStep("email");
  };

  async function handleMint(item: GalleryItem) {
    if (!ipSession || !ipSelectedCollection) return;
    const id = item.id;

    setIpMintState((p) => ({ ...p, [id]: "EXTRACTING FRAME" }));
    try {
      const mediaUri = `ipfs://${item.cid}`;

      // Step 1: Extract first frame of video as cover art and upload to Arweave
      const coverBlob = await extractVideoFrame(item.url);
      const coverBuffer = await coverBlob.arrayBuffer();
      const coverBytes = new Uint8Array(coverBuffer);
      let coverBinary = "";
      for (let i = 0; i < coverBytes.length; i++) coverBinary += String.fromCharCode(coverBytes[i]);
      const coverBase64 = btoa(coverBinary);
      const coverRes = await fetch("/api/inprocess/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: coverBase64,
          contentType: "image/png",
          filename: "cover.png",
          apiKey: ipSession.token,
        }),
      });
      let imageUri = "";
      if (coverRes.ok) {
        const coverData = await coverRes.json();
        imageUri = coverData.uri;
      }

      // Step 2: Build + upload metadata to Arweave
      setIpMintState((p) => ({ ...p, [id]: "UPLOADING METADATA" }));
      const metadata = {
        name: `${item.artist} - ${item.title}`.toUpperCase(),
        description: "Made with automash.xyz",
        image: imageUri || mediaUri,
        animation_url: mediaUri,
        content: { mime: "video/mp4", uri: mediaUri },
      };
      const metaBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(metadata))));
      const metaRes = await fetch("/api/inprocess/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: metaBase64,
          contentType: "application/json",
          filename: "metadata.json",
          apiKey: ipSession.token,
        }),
      });
      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}));
        if (metaRes.status === 401) clearIpSession();
        throw new Error(errData.error || `METADATA UPLOAD FAILED (${metaRes.status})`);
      }
      const { uri: momentUri } = await metaRes.json();

      // Step 3: Mint
      setIpMintState((p) => ({ ...p, [id]: "MINTING" }));
      const mintRes = await fetch("/api/inprocess/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          momentUri,
          collectionAddress: ipSelectedCollection.address,
          account: ipSession.wallet,
          recipientCount: 1,
          apiKey: ipSession.token,
        }),
      });
      if (!mintRes.ok) {
        const errData = await mintRes.json().catch(() => ({}));
        if (mintRes.status === 401) clearIpSession();
        throw new Error(errData.error || `MINT FAILED (${mintRes.status})`);
      }
      const mintData = await mintRes.json().catch(() => ({}));

      // Airdrop to cxy.eth
      if (mintData.tokenId || mintData.token_id) {
        setIpMintState((p) => ({ ...p, [id]: "AIRDROPPING" }));
        const tokenId = mintData.tokenId || mintData.token_id;
        await fetch("/api/inprocess/airdrop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionAddress: ipSelectedCollection.address,
            tokenId,
            recipients: ["0x7b753919b953b1021a33f55671716dc13c1eae08"],
            account: ipSession.wallet,
            apiKey: ipSession.token,
          }),
        }).catch(() => {});
      }

      setIpMintState((p) => ({ ...p, [id]: "done" }));
      setIpMintResult((p) => {
        const next = { ...p, [id]: "MINTED" };
        localStorage.setItem("automash_mints", JSON.stringify(next));
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MINT FAILED";
      // Both "SetupNewToken event not found" and the "userOpHash regex" error mean the inprocess
      // server failed to parse the tx, but the on-chain mint usually succeeded. Verify against the
      // on-chain list and flip to MINTED if we find it; otherwise clear state so MINT returns
      // (the ugly raw JSON used to leak to the UI).
      const isParseError = /setupnewtoken/i.test(msg) || /userophash/i.test(msg);
      if (isParseError) {
        setIpMintState((p) => ({ ...p, [id]: "VERIFYING ON-CHAIN" }));
        setIpMintResult((p) => ({ ...p, [id]: "VERIFYING ON-CHAIN" }));
        const combined = `${item.artist} - ${item.title}`.toLowerCase().trim();
        let mintedNames = await syncOnChainMints();
        if (!mintedNames.has(combined)) {
          await new Promise((r) => setTimeout(r, 8000));
          mintedNames = await syncOnChainMints();
        }
        if (mintedNames.has(combined)) {
          setIpMintState((p) => ({ ...p, [id]: "done" }));
          setIpMintResult((p) => {
            const next = { ...p, [id]: "MINTED" };
            localStorage.setItem("automash_mints", JSON.stringify(next));
            return next;
          });
          return;
        }
        // On-chain still not showing — drop the error entirely so MINT button returns.
        setIpMintState((p) => { const n = { ...p }; delete n[id]; return n; });
        setIpMintResult((p) => { const n = { ...p }; delete n[id]; return n; });
        return;
      }
      // Shorten and sanitize non-parse errors so the raw JSON payload never reaches the UI.
      const clean = msg.replace(/[{}"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40).toUpperCase() || "MINT FAILED";
      setIpMintState((p) => ({ ...p, [id]: "error" }));
      setIpMintResult((p) => ({ ...p, [id]: clean }));
    }
  }
  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then((data) => {
        const fetchedItems: GalleryItem[] = data.items || [];
        setItems(fetchedItems);
        setUploadResult((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const it of fetchedItems) {
            if (it.youtubeUrl && next[it.id] !== it.youtubeUrl) {
              next[it.id] = it.youtubeUrl;
              changed = true;
            }
          }
          if (changed) localStorage.setItem("automash_yt_uploads", JSON.stringify(next));
          return changed ? next : prev;
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function loadAllFiles() {
    setAllFilesLoading(true);
    try {
      const res = await fetch("/api/gallery?all=1");
      const data = await res.json();
      setAllFiles(data.files || []);
    } catch {}
    setAllFilesLoading(false);
  }

  async function handleYouTubeUpload(item: GalleryItem) {
    setUploading(item.id);
    try {
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, artist: item.artist, title: item.title, fileId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "UPLOAD FAILED");
      setUploadResult((prev) => {
        const next = { ...prev, [item.id]: data.youtubeUrl };
        localStorage.setItem("automash_yt_uploads", JSON.stringify(next));
        return next;
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "FAILED";
      const clean = raw.replace(/[{}"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40).toUpperCase() || "FAILED";
      setUploadResult((prev) => ({ ...prev, [item.id]: clean }));
    }
    setUploading(null);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {}
    setDeleting(null);
  }

  async function fetchPlaylist() {
    if (!playlistUrl.trim()) return;
    setPlaylistFetching(true);
    setPlaylistError("");
    setPlaylistTracks([]);
    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: playlistUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "FAILED");
      setPlaylistTracks(
        data.items.map((item: { videoId: string; title: string }) => ({ ...item, status: "pending" }))
      );
    } catch (e) {
      setPlaylistError(e instanceof Error ? e.message : "FAILED TO FETCH PLAYLIST");
    }
    setPlaylistFetching(false);
  }

  async function downloadTrack(index: number) {
    const track = playlistTracks[index];
    setPlaylistTracks((prev) => prev.map((t, i) => (i === index ? { ...t, status: "downloading", error: undefined } : t)));
    try {
      const res = await fetch("/api/cobalt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${track.videoId}` }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const title = res.headers.get("X-Audio-Title") || track.title;
      const safeName = title.replace(/[^\w\s-]/g, "").trim() || "track";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.mp3`;
      a.click();
      URL.revokeObjectURL(a.href);
      setPlaylistTracks((prev) => prev.map((t, i) => (i === index ? { ...t, status: "done" } : t)));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "DOWNLOAD FAILED";
      setPlaylistTracks((prev) => prev.map((t, i) => (i === index ? { ...t, status: "error", error: msg } : t)));
      return false;
    }
  }

  async function downloadAllTracks() {
    setPlaylistDownloading(true);
    const pending = playlistTracks.filter((t) => t.status !== "done");
    setPlaylistProgress({ current: 0, total: pending.length });
    for (let i = 0; i < playlistTracks.length; i++) {
      if (playlistTracks[i].status === "done") continue;
      await downloadTrack(i);
      setPlaylistProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      await new Promise((r) => setTimeout(r, 2000));
    }
    setPlaylistDownloading(false);
  }

  const plDoneCount = playlistTracks.filter((t) => t.status === "done").length;
  const plErrorCount = playlistTracks.filter((t) => t.status === "error").length;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8" style={{ background: "#fff" }}>
      <div className="w-full max-w-[1100px] flex flex-col gap-5">
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center gap-4 px-3">
            <span
              className="text-lg sm:text-xl tracking-[2px] uppercase"
              style={textStyle}
            >
              GALLERY
            </span>
            <a
              href="https://www.youtube.com/@SLOWANDREVERBEDMACHINE/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] uppercase tracking-wider border-2 border-black px-2 py-1"
              style={{ ...textStyle, fontSize: "9px", background: "transparent" }}
            >
              YOUTUBE
            </a>
            <div className="ml-auto flex gap-2">
              <Link
                href="/"
                className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black"
                style={{ ...textStyle, fontSize: "10px", background: "transparent" }}
              >
                AUTO MASH
              </Link>
            </div>
          </div>

          {/* inprocess.world minting (admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-3 px-3 py-4 border-2 border-black">
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.15em]" style={textStyle}>INPROCESS</span>
                <button
                  onClick={() => setShowInprocess(!showInprocess)}
                  className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black ml-auto"
                  style={{ ...textStyle, fontSize: "10px", background: showInprocess ? "#000" : "transparent", color: showInprocess ? "#fff" : "#000" }}
                >
                  {showInprocess ? "HIDE" : "SHOW"}
                </button>
              </div>
              {showInprocess && (
                <div className="flex flex-col gap-3">
                  {ipAuthStep === "done" && ipSession ? (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", color: "#228B22" }}>
                          LOGGED IN AS {ipSession.username}
                        </span>
                        <button
                          onClick={ipLogout}
                          className="text-[9px] uppercase tracking-wider border border-black px-2 py-1"
                          style={{ ...textStyle, fontSize: "9px", background: "transparent" }}
                        >
                          LOGOUT
                        </button>
                      </div>
                      {/* Collection picker */}
                      {ipCollections.length === 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", opacity: 0.5 }}>NO COLLECTIONS</span>
                          <a href="https://www.inprocess.world" target="_blank" rel="noopener noreferrer" className="text-[9px] uppercase tracking-wider border border-black px-2 py-1" style={{ ...textStyle, fontSize: "9px", background: "transparent" }}>
                            CREATE AT INPROCESS.WORLD
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", opacity: 0.5 }}>COLLECTION:</span>
                          {ipCollections.map((c) => (
                            <button
                              key={c.address}
                              onClick={() => setIpSelectedCollection(c)}
                              className="text-[9px] uppercase tracking-wider border border-black px-2 py-1"
                              style={{
                                ...textStyle, fontSize: "9px",
                                background: ipSelectedCollection?.address === c.address ? "#000" : "transparent",
                                color: ipSelectedCollection?.address === c.address ? "#fff" : "#000",
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {ipAuthStep === "email" && (
                        <div className="flex items-center gap-2">
                          <input
                            value={ipEmail}
                            onChange={(e) => setIpEmail(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && ipSendCode()}
                            placeholder="EMAIL"
                            className="border-2 border-black px-3 py-1 text-[10px] uppercase tracking-wider flex-1"
                            style={{ ...textStyle, fontSize: "10px", background: "transparent", outline: "none" }}
                          />
                          <button
                            onClick={ipSendCode}
                            disabled={ipAuthLoading}
                            className="text-[9px] uppercase tracking-wider border-2 border-black px-3 py-1"
                            style={{ ...textStyle, fontSize: "9px", background: "transparent", opacity: ipAuthLoading ? 0.4 : 1 }}
                          >
                            {ipAuthLoading ? "..." : "SEND CODE"}
                          </button>
                        </div>
                      )}
                      {ipAuthStep === "code" && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", opacity: 0.5 }}>CODE SENT TO {ipEmail}</span>
                          <input
                            value={ipCode}
                            onChange={(e) => setIpCode(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && ipVerifyCode()}
                            placeholder="CODE"
                            className="border-2 border-black px-3 py-1 text-[10px] uppercase tracking-wider w-[100px]"
                            style={{ ...textStyle, fontSize: "10px", background: "transparent", outline: "none" }}
                          />
                          <button
                            onClick={ipVerifyCode}
                            disabled={ipAuthLoading}
                            className="text-[9px] uppercase tracking-wider border-2 border-black px-3 py-1"
                            style={{ ...textStyle, fontSize: "9px", background: "transparent", opacity: ipAuthLoading ? 0.4 : 1 }}
                          >
                            {ipAuthLoading ? "..." : "VERIFY"}
                          </button>
                        </div>
                      )}
                      {ipAuthError && (
                        <span className="text-[9px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "9px", color: "#c82828" }}>{ipAuthError}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* All Pinata Files (admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-3 px-3 py-4 border-2 border-black">
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.15em]" style={textStyle}>
                  PINATA FILES
                </span>
                <button
                  onClick={() => { setShowAllFiles(!showAllFiles); if (!showAllFiles && allFiles.length === 0) loadAllFiles(); }}
                  className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black ml-auto"
                  style={{ ...textStyle, fontSize: "10px", background: showAllFiles ? "#000" : "transparent", color: showAllFiles ? "#fff" : "#000" }}
                >
                  {showAllFiles ? "HIDE" : "SHOW"}
                </button>
                {showAllFiles && (
                  <>
                    <button
                      onClick={loadAllFiles}
                      disabled={allFilesLoading}
                      className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black"
                      style={{ ...textStyle, fontSize: "10px", background: "transparent", opacity: allFilesLoading ? 0.4 : 1 }}
                    >
                      {allFilesLoading ? "..." : "REFRESH"}
                    </button>
                    <button
                      onClick={() => downloadFiles(allFiles)}
                      disabled={downloading || allFiles.length === 0}
                      className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black"
                      style={{ ...textStyle, fontSize: "10px", background: "transparent", opacity: (downloading || allFiles.length === 0) ? 0.4 : 1 }}
                    >
                      {downloading ? `${downloadProgress.current}/${downloadProgress.total}` : "DOWNLOAD ALL"}
                    </button>
                    <button
                      onClick={() => { const nf = getNewFiles(); if (nf.length > 0) downloadFiles(nf); }}
                      disabled={downloading || allFiles.length === 0}
                      className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 border-2 border-black"
                      style={{ ...textStyle, fontSize: "10px", background: "transparent", opacity: (downloading || allFiles.length === 0) ? 0.4 : 1 }}
                    >
                      {`NEW (${getNewFiles().length})`}
                    </button>
                  </>
                )}
              </div>
              {showAllFiles && (
                <div className="flex flex-col border-2 border-black divide-y divide-black max-h-[400px] overflow-y-auto">
                  {allFilesLoading && (
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", opacity: 0.5 }}>
                      LOADING...
                    </div>
                  )}
                  {!allFilesLoading && allFiles.length === 0 && (
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", opacity: 0.5 }}>
                      NO FILES
                    </div>
                  )}
                  {allFiles.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider truncate" style={textStyle}>
                          {f.name}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider opacity-40" style={textStyle}>
                          {f.type || f.mimeType || "—"} · {f.size ? `${(f.size / 1024 / 1024).toFixed(1)}MB` : "—"} · {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                        </span>
                      </div>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] uppercase tracking-wider border border-black px-2 py-1 shrink-0"
                        style={{ ...textStyle, fontSize: "9px", background: "transparent" }}
                      >
                        OPEN
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Playlist Downloader (admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-3 px-3 py-4 border-2 border-black">
              <span className="text-[11px] uppercase tracking-[0.15em]" style={textStyle}>
                PLAYLIST DOWNLOADER
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchPlaylist()}
                  placeholder="PASTE YOUTUBE PLAYLIST URL"
                  className="flex-1 px-3 py-2 border-2 border-black text-[11px] uppercase tracking-wider outline-none"
                  style={{ ...textStyle, fontSize: "11px", background: "transparent" }}
                />
                <button
                  onClick={fetchPlaylist}
                  disabled={playlistFetching || !playlistUrl.trim()}
                  className="px-4 py-2 border-2 border-black text-[11px] uppercase tracking-wider"
                  style={{ ...textStyle, fontSize: "11px", background: playlistFetching ? "#000" : "transparent", color: playlistFetching ? "#fff" : "#000", opacity: !playlistUrl.trim() ? 0.3 : 1 }}
                >
                  {playlistFetching ? "LOADING..." : "FETCH"}
                </button>
              </div>
              {playlistError && (
                <span className="text-[10px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "10px", color: "#c82828" }}>
                  {playlistError}
                </span>
              )}
              {playlistTracks.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "11px", opacity: 0.5 }}>
                      {playlistTracks.length} TRACKS{plDoneCount > 0 && ` / ${plDoneCount} DONE`}{plErrorCount > 0 && ` / ${plErrorCount} FAILED`}
                    </span>
                    <button
                      onClick={downloadAllTracks}
                      disabled={playlistDownloading || plDoneCount === playlistTracks.length}
                      className="ml-auto px-4 py-2 border-2 border-black text-[11px] uppercase tracking-wider"
                      style={{ ...textStyle, fontSize: "11px", background: playlistDownloading ? "#000" : "transparent", color: playlistDownloading ? "#fff" : "#000", opacity: plDoneCount === playlistTracks.length ? 0.3 : 1 }}
                    >
                      {playlistDownloading ? `DOWNLOADING ${playlistProgress.current}/${playlistProgress.total}` : plDoneCount > 0 && plDoneCount < playlistTracks.length ? "DOWNLOAD REMAINING" : "DOWNLOAD ALL"}
                    </button>
                  </div>
                  <div className="flex flex-col border-2 border-black divide-y-2 divide-black max-h-[300px] overflow-y-auto">
                    {playlistTracks.map((track, i) => (
                      <div
                        key={track.videoId}
                        className="flex items-center gap-3 px-3 py-2"
                        style={{ background: track.status === "done" ? "#f0f0f0" : track.status === "error" ? "#fff5f5" : "transparent" }}
                      >
                        <span className="text-[10px] uppercase tracking-wider shrink-0 w-6 text-right" style={{ ...textStyle, fontSize: "10px", opacity: 0.3 }}>
                          {i + 1}
                        </span>
                        <span className="text-[11px] uppercase tracking-wider truncate flex-1" style={{ ...textStyle, fontSize: "11px", opacity: track.status === "done" ? 0.4 : 1 }}>
                          {track.title}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ ...textStyle, fontSize: "9px", color: track.status === "done" ? "#228B22" : track.status === "error" ? "#c82828" : track.status === "downloading" ? "#000" : "transparent" }}>
                          {track.status === "downloading" ? "..." : track.status === "done" ? "DONE" : track.status === "error" ? (track.error || "FAILED") : ""}
                        </span>
                        {track.status === "error" && !playlistDownloading && (
                          <button
                            onClick={() => downloadTrack(i)}
                            className="text-[9px] uppercase tracking-wider border border-black px-2 py-0.5 shrink-0"
                            style={{ ...textStyle, fontSize: "9px", background: "transparent" }}
                          >
                            RETRY
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div
              className="text-[11px] uppercase tracking-wider text-center py-8"
              style={textStyle}
            >
              LOADING...
            </div>
          ) : items.length === 0 ? (
            <div
              className="text-[11px] uppercase tracking-wider text-center py-8"
              style={{ ...textStyle, opacity: 0.5 }}
            >
              NO EXPORTS YET
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.slice(0, visibleCount).map((item) => (
                <div key={item.id} data-item-id={item.id} className="flex flex-col gap-2 border-2 border-black p-2 relative">
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting === item.id}
                      className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center border-2 border-black"
                      style={{ ...textStyle, fontSize: "14px", background: "#fff", lineHeight: 1 }}
                    >
                      {deleting === item.id ? "..." : "X"}
                    </button>
                  )}
                  <LazyVideo
                    src={item.url}
                    onError={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] uppercase tracking-wider truncate" style={textStyle}>
                      {item.artist}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider truncate" style={{ ...textStyle, opacity: 0.7 }}>
                      {item.title}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ ...textStyle, opacity: 0.4 }}>
                      {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="mt-1 flex gap-2 flex-wrap items-center">
                      {/* YouTube */}
                      {uploadResult[item.id] ? (
                        uploadResult[item.id].startsWith("http") ? (
                          <span className="text-[9px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "9px", color: "#228B22" }}>YT</span>
                        ) : (
                          <span className="text-[9px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "9px", color: "#c82828" }}>{uploadResult[item.id]}</span>
                        )
                      ) : (
                        <button
                          onClick={() => handleYouTubeUpload(item)}
                          disabled={uploading === item.id}
                          className="text-[9px] uppercase tracking-wider border border-black px-2 py-1"
                          style={{ ...textStyle, fontSize: "9px", background: "transparent", opacity: uploading === item.id ? 0.4 : 1 }}
                        >
                          {uploading === item.id ? "..." : "YOUTUBE"}
                        </button>
                      )}
                      {/* Mint */}
                      {ipSession && ipSelectedCollection && (
                        ipMintResult[item.id] ? (
                          <span className="text-[9px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "9px", color: ipMintResult[item.id] === "MINTED" ? "#228B22" : "#c82828" }}>
                            {ipMintResult[item.id]}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleMint(item)}
                            disabled={!!ipMintState[item.id] && ipMintState[item.id] !== "error"}
                            className="text-[9px] uppercase tracking-wider border border-black px-2 py-1"
                            style={{ ...textStyle, fontSize: "9px", background: "transparent", opacity: (ipMintState[item.id] && ipMintState[item.id] !== "error") ? 0.4 : 1 }}
                          >
                            {ipMintState[item.id] && ipMintState[item.id] !== "error" && ipMintState[item.id] !== "done"
                              ? ipMintState[item.id]
                              : "MINT"}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {visibleCount < items.length && (
              <button
                onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, items.length))}
                className="w-full py-3 border-2 border-black text-[11px] uppercase tracking-[0.15em]"
                style={{ ...textStyle, fontSize: "11px", background: "transparent" }}
              >
                LOAD MORE ({items.length - visibleCount} REMAINING)
              </button>
            )}
            </>
          )}
        </div>
        <div className="flex gap-4 justify-center py-4">
          <Link href="/terms" className="text-[11px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "11px", opacity: 0.5 }}>
            TERMS
          </Link>
          <Link href="/privacy" className="text-[11px] uppercase tracking-wider" style={{ ...textStyle, fontSize: "11px", opacity: 0.5 }}>
            PRIVACY
          </Link>
        </div>
      </div>
    </main>
  );
}
