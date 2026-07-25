import sampleData from "@/data/sample-bank.json";
import type { QuestionBank } from "@/lib/types";

const SAMPLE_BANK = sampleData as unknown as QuestionBank;

// data/bank.json (real ingested 기출 데이터) is several MB — too big to bundle
// into every serverless function. It's committed to the repo instead, and
// fetched from there at build/request time with ISR caching. Override with
// BANK_DATA_URL if the data lives somewhere else.
const BANK_URL =
  process.env.BANK_DATA_URL ??
  "https://raw.githubusercontent.com/wesslvc/newkice/claude/pyeongwon-based-creation-iiex1s/data/bank.json";

let cached: QuestionBank | null = null;

export async function getBank(): Promise<QuestionBank> {
  if (cached) return cached;
  try {
    const res = await fetch(BANK_URL, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = (await res.json()) as QuestionBank;
      if (data.passages?.length > 0) {
        cached = data;
        return data;
      }
    }
  } catch {
    // network unavailable (e.g. offline dev) — fall back to sample data below
  }
  return SAMPLE_BANK;
}

export function isSampleBank(bank: QuestionBank): boolean {
  return bank === SAMPLE_BANK;
}
