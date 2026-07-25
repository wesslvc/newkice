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

export async function getBank(): Promise<QuestionBank> {
  try {
    // bank.json is well over Next's 2MB fetch-cache limit, so `next.revalidate`
    // never actually caches it — every call already re-fetches from GitHub raw.
    // (A module-level `cached` variable here previously locked in whatever the
    // first fetch on a warm serverless instance returned, for that instance's
    // entire lifetime — including a stale result if it raced GitHub raw's own
    // 5-minute CDN cache right after a push. Don't reintroduce that.)
    const res = await fetch(BANK_URL, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = (await res.json()) as QuestionBank;
      if (data.passages?.length > 0) {
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
