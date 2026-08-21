// ROLE: shared convention-profile contracts and token indexes.
// PURITY: pure — no fs/network/clock (L3).

import type { Finding } from "./framework";

export const CONVENTIONS_DIR = ".rk/conventions";
export const PROFILE_SCHEMA_VERSION = "1";
export const MACRO_TOKEN_RE = /^\\[A-Za-z]+$/;

export interface ChainLattice {
  kind: "chain";
  values: string[];
}

export interface PosetLattice {
  kind: "poset";
  values: string[];
  edges: [string, string][];
}

export type Lattice = ChainLattice | PosetLattice;

export interface TrackedClass {
  class: string;
  description: string;
  symbols: string[];
  blessed: string;
}

export interface ConventionProfile {
  schema_version: string;
  name: string;
  version: number;
  predecessor_sha256?: string;
  notation: "draft" | "complete";
  tracked_classes: TrackedClass[];
  lattices: Record<string, Lattice>;
  choices: Record<string, { canonical: string; allowed_translations: string[]; notes?: string }>;
  enums: Record<string, string[]>;
}

export interface ProfileValidation {
  findings: Finding[];
  checked: number;
  total: number;
  profile?: ConventionProfile;
}

export interface ProfileParseResult {
  profile?: ConventionProfile;
  errors: string[];
}

export function profileFilePath(ref: string): string {
  return `${CONVENTIONS_DIR}/${ref}.json`;
}

export function profileError(path: string, message: string): Finding {
  return { severity: "ERROR", path, line: 1, message, structural: true };
}

/** Every raw and blessed token -> sorted claiming classes. */
export function trackedSymbolIndex(profile: ConventionProfile): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const trackedClass of profile.tracked_classes) {
    for (const symbol of [...trackedClass.symbols, trackedClass.blessed]) {
      const classes = index.get(symbol) ?? new Set<string>();
      classes.add(trackedClass.class);
      index.set(symbol, classes);
    }
  }
  return new Map([...index].map(([symbol, classes]) => [symbol, [...classes].sort()]));
}

export function enforceableSymbolIndex(profile: ConventionProfile): Map<string, string[]> {
  return new Map([...trackedSymbolIndex(profile)].filter(([symbol]) => MACRO_TOKEN_RE.test(symbol)));
}

/** Raw source macros only; campaign prose must instead use blessedSymbolIndex. */
export function enforceableRawSymbolIndex(profile: ConventionProfile): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const trackedClass of profile.tracked_classes) {
    for (const symbol of trackedClass.symbols) {
      if (!MACRO_TOKEN_RE.test(symbol)) continue;
      const classes = index.get(symbol) ?? new Set<string>();
      classes.add(trackedClass.class);
      index.set(symbol, classes);
    }
  }
  return new Map([...index].map(([symbol, classes]) => [symbol, [...classes].sort()]));
}

export function blessedSymbolIndex(profile: ConventionProfile): Map<string, string> {
  return new Map(profile.tracked_classes.map((trackedClass) => [trackedClass.blessed, trackedClass.class]));
}

export function unenforceableSymbols(profile: ConventionProfile): string[] {
  return [...trackedSymbolIndex(profile).keys()].filter((symbol) => !MACRO_TOKEN_RE.test(symbol)).sort();
}
