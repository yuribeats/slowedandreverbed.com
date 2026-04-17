/* ─── Key Compatibility — Music Theory ─── */

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function noteIndexToKeyName(noteIndex: number, mode: "major" | "minor"): string {
  return `${NOTE_NAMES[noteIndex % 12]} ${mode === "major" ? "Major" : "Minor"}`;
}

/**
 * Returns all compatible key names:
 * 1. Same key (exact match)
 * 2. Relative major/minor (shares all notes)
 * 3. Keys ±1 to ±3 semitones away in same mode (nearby keys)
 */
export function getCompatibleKeys(keyName: string): string[] {
  const parts = keyName.trim().split(/\s+/);
  if (parts.length < 2) return [keyName];

  const note = parts[0];
  const mode = parts[1].toLowerCase() as "major" | "minor";
  const noteIdx = NOTE_NAMES.indexOf(note);
  if (noteIdx < 0) return [keyName];

  const results: string[] = [keyName];

  // Relative major/minor
  if (mode === "major") {
    const relIdx = (noteIdx - 3 + 12) % 12;
    results.push(`${NOTE_NAMES[relIdx]} Minor`);
  } else {
    const relIdx = (noteIdx + 3) % 12;
    results.push(`${NOTE_NAMES[relIdx]} Major`);
  }

  // ±1 to ±3 semitones in same mode
  const modeLabel = mode === "major" ? "Major" : "Minor";
  for (let i = 1; i <= 3; i++) {
    const upIdx = (noteIdx + i) % 12;
    const downIdx = (noteIdx - i + 12) % 12;
    const upKey = `${NOTE_NAMES[upIdx]} ${modeLabel}`;
    const downKey = `${NOTE_NAMES[downIdx]} ${modeLabel}`;
    if (!results.includes(upKey)) results.push(upKey);
    if (!results.includes(downKey)) results.push(downKey);
  }

  return results;
}

export function matchReason(sourceKey: string, matchKey: string): string {
  if (sourceKey === matchKey) return "SAME KEY";

  const srcParts = sourceKey.trim().split(/\s+/);
  const dstParts = matchKey.trim().split(/\s+/);
  if (srcParts.length < 2 || dstParts.length < 2) return "";

  const srcIdx = NOTE_NAMES.indexOf(srcParts[0]);
  const dstIdx = NOTE_NAMES.indexOf(dstParts[0]);
  const srcMode = srcParts[1].toLowerCase();
  const dstMode = dstParts[1].toLowerCase();

  if (srcMode !== dstMode) {
    // Check relative
    if (srcMode === "major" && (srcIdx - 3 + 12) % 12 === dstIdx) return "RELATIVE MINOR";
    if (srcMode === "minor" && (srcIdx + 3) % 12 === dstIdx) return "RELATIVE MAJOR";
    return "";
  }

  // Same mode — check semitone distance
  let diff = Math.abs(dstIdx - srcIdx);
  if (diff > 6) diff = 12 - diff;
  if (diff >= 1 && diff <= 3) return `±${diff} SEMITONE${diff > 1 ? "S" : ""}`;

  return "";
}
