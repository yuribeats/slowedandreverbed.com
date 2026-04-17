/* ─── Camelot Wheel ─── */

export interface CamelotEntry {
  number: number;  // 1–12
  letter: "A" | "B";  // A = minor, B = major
  keyName: string;  // e.g. "Db Major"
  note: string;     // e.g. "Db"
  mode: "major" | "minor";
}

// Full Camelot wheel lookup
const WHEEL: CamelotEntry[] = [
  { number: 1,  letter: "B", keyName: "B Major",  note: "B",  mode: "major" },
  { number: 1,  letter: "A", keyName: "Ab Minor", note: "Ab", mode: "minor" },
  { number: 2,  letter: "B", keyName: "Gb Major", note: "Gb", mode: "major" },
  { number: 2,  letter: "A", keyName: "Eb Minor", note: "Eb", mode: "minor" },
  { number: 3,  letter: "B", keyName: "Db Major", note: "Db", mode: "major" },
  { number: 3,  letter: "A", keyName: "Bb Minor", note: "Bb", mode: "minor" },
  { number: 4,  letter: "B", keyName: "Ab Major", note: "Ab", mode: "major" },
  { number: 4,  letter: "A", keyName: "F Minor",  note: "F",  mode: "minor" },
  { number: 5,  letter: "B", keyName: "Eb Major", note: "Eb", mode: "major" },
  { number: 5,  letter: "A", keyName: "C Minor",  note: "C",  mode: "minor" },
  { number: 6,  letter: "B", keyName: "Bb Major", note: "Bb", mode: "major" },
  { number: 6,  letter: "A", keyName: "G Minor",  note: "G",  mode: "minor" },
  { number: 7,  letter: "B", keyName: "F Major",  note: "F",  mode: "major" },
  { number: 7,  letter: "A", keyName: "D Minor",  note: "D",  mode: "minor" },
  { number: 8,  letter: "B", keyName: "C Major",  note: "C",  mode: "major" },
  { number: 8,  letter: "A", keyName: "A Minor",  note: "A",  mode: "minor" },
  { number: 9,  letter: "B", keyName: "G Major",  note: "G",  mode: "major" },
  { number: 9,  letter: "A", keyName: "E Minor",  note: "E",  mode: "minor" },
  { number: 10, letter: "B", keyName: "D Major",  note: "D",  mode: "major" },
  { number: 10, letter: "A", keyName: "B Minor",  note: "B",  mode: "minor" },
  { number: 11, letter: "B", keyName: "A Major",  note: "A",  mode: "major" },
  { number: 11, letter: "A", keyName: "Gb Minor", note: "Gb", mode: "minor" },
  { number: 12, letter: "B", keyName: "E Major",  note: "E",  mode: "major" },
  { number: 12, letter: "A", keyName: "Db Minor", note: "Db", mode: "minor" },
];

// noteIndex (0=C..11=B) + mode → Camelot entry
const NOTE_TO_KEY: Record<string, string> = {
  "0_major": "C Major",   "0_minor": "C Minor",
  "1_major": "Db Major",  "1_minor": "Db Minor",
  "2_major": "D Major",   "2_minor": "D Minor",
  "3_major": "Eb Major",  "3_minor": "Eb Minor",
  "4_major": "E Major",   "4_minor": "E Minor",
  "5_major": "F Major",   "5_minor": "F Minor",
  "6_major": "Gb Major",  "6_minor": "Gb Minor",
  "7_major": "G Major",   "7_minor": "G Minor",
  "8_major": "Ab Major",  "8_minor": "Ab Minor",
  "9_major": "A Major",   "9_minor": "A Minor",
  "10_major": "Bb Major", "10_minor": "Bb Minor",
  "11_major": "B Major",  "11_minor": "B Minor",
};

function findEntry(keyName: string): CamelotEntry | undefined {
  return WHEEL.find((e) => e.keyName === keyName);
}

export function noteIndexToKeyName(noteIndex: number, mode: "major" | "minor"): string {
  return NOTE_TO_KEY[`${noteIndex}_${mode}`] ?? `${noteIndex} ${mode}`;
}

/**
 * Returns compatible key names for harmonic mixing via Camelot wheel.
 * Same slot (cross-mode) + same letter ±1.
 * Example: 3B (Db Major) → { Db Major, Bb Minor, Gb Major, Ab Major }
 */
export function getCompatibleKeys(keyName: string): string[] {
  const entry = findEntry(keyName);
  if (!entry) return [keyName];

  const results: string[] = [keyName];

  // Same number, opposite letter (relative major/minor)
  const crossMode = WHEEL.find(
    (e) => e.number === entry.number && e.letter !== entry.letter
  );
  if (crossMode) results.push(crossMode.keyName);

  // Same letter, number ±1 (wrap 12→1, 1→12)
  const prev = ((entry.number - 2 + 12) % 12) + 1;
  const next = (entry.number % 12) + 1;

  const prevEntry = WHEEL.find((e) => e.number === prev && e.letter === entry.letter);
  const nextEntry = WHEEL.find((e) => e.number === next && e.letter === entry.letter);

  if (prevEntry) results.push(prevEntry.keyName);
  if (nextEntry) results.push(nextEntry.keyName);

  return results;
}

/**
 * Returns a label describing *why* a key is compatible.
 */
export function matchReason(sourceKey: string, matchKey: string): string {
  if (sourceKey === matchKey) return "SAME KEY";
  const src = findEntry(sourceKey);
  const dst = findEntry(matchKey);
  if (!src || !dst) return "";
  if (src.number === dst.number && src.letter !== dst.letter) {
    return dst.mode === "minor" ? "RELATIVE MINOR" : "RELATIVE MAJOR";
  }
  return "ADJACENT CAMELOT";
}

/**
 * Format a Camelot code for display (e.g. "3B")
 */
export function camelotCode(keyName: string): string {
  const entry = findEntry(keyName);
  return entry ? `${entry.number}${entry.letter}` : "";
}
