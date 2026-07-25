import bankData from "@/data/bank.json";
import sampleData from "@/data/sample-bank.json";
import type { QuestionBank } from "@/lib/types";

// JSON imports infer widened literal types (e.g. number[] instead of the
// [number, number] tuple), so we go through `unknown` rather than pretend
// the raw JSON shape already matches QuestionBank structurally.
const REAL_BANK = bankData as unknown as QuestionBank;
const SAMPLE_BANK = sampleData as unknown as QuestionBank;

/**
 * Returns the real ingested bank (data/bank.json) if it has content, and
 * falls back to the labeled sample bank otherwise so the UI has something
 * to demo before a real source PDF is ingested (see scripts/ingest.ts).
 */
export function getBank(): QuestionBank {
  return REAL_BANK.passages.length > 0 ? REAL_BANK : SAMPLE_BANK;
}

export function isSampleData(): boolean {
  return REAL_BANK.passages.length === 0;
}
