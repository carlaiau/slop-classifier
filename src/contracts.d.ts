export type Method = 'sentence' | 'sentence-context' | 'prefix-mean' | 'prefix-upper' | 'combined';
export type Status = 'unscored' | 'pending' | 'scored' | 'insufficient' | 'failed';
export interface Sentence { id: string; start: number; end: number; text: string; preceding: string }
export interface WordSignal { start: number; end: number; raw: number }
export interface ScoreResult {
  id: string; start: number; end: number; status: Status;
  raw: number | null; calibrated: number | null; reason?: string;
  words?: WordSignal[]; features?: number[]; scoringVersion: string;
  model: string; cached?: boolean;
}
export interface ResearchExample extends Sentence {
  sourceId: string; recordId: string; officialSplit: 'train' | 'dev' | 'test';
  split: 'development' | 'calibration' | 'test'; domain: string;
  generator: string; version: string; label: 0 | 1; provenance: string;
  authorId?: string; sourceHash: string; synthetic: boolean;
  gapBefore?: string; trailing?: string;
}
export interface ResearchFeatureResult {
  id: string; status: 'features'; features: number[];
  raw: null; calibrated: null; scoringVersion: string; model: string;
}
