/* ─── Key Compatibility — Music Theory ─── */

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function noteIndexToKeyName(noteIndex: number, mode: "major" | "minor"): string {
  return `${NOTE_NAMES[noteIndex % 12]} ${mode === "major" ? "Major" : "Minor"}`;
}

/**
 * Returns compatible key names: same key + relative major/minor only.
 */
export function getCompatibleKeys(keyName: string): string[] {
  const parts = keyName.trim().split(/\s+/);
  if (parts.length < 2) return [keyName];

  const note = parts[0];
  const mode = parts[1].toLowerCase() as "major" | "minor";
  const noteIdx = NOTE_NAMES.indexOf(note);
  if (noteIdx < 0) return [keyName];

  const results: string[] = [keyName];

  if (mode === "major") {
    const relIdx = (noteIdx - 3 + 12) % 12;
    results.push(`${NOTE_NAMES[relIdx]} Minor`);
  } else {
    const relIdx = (noteIdx + 3) % 12;
    results.push(`${NOTE_NAMES[relIdx]} Major`);
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

  if (srcMode === "major" && dstMode === "minor" && (srcIdx - 3 + 12) % 12 === dstIdx) return "RELATIVE MINOR";
  if (srcMode === "minor" && dstMode === "major" && (srcIdx + 3) % 12 === dstIdx) return "RELATIVE MAJOR";

  return "PITCH MATCH";
}
