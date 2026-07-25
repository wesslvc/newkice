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
    // bank.json is well over Next's 2MB fetch-cache limit, so a per-instance
    // "can't cache" warning fires and you'd expect every call to hit the
    // network — but Vercel's Data Cache is a durable, cross-deployment store,
    // and in practice a stale entry (e.g. one that raced GitHub raw's own
    // 5-minute CDN cache right after a push) kept getting served well past
    // revalidate's window on every later deployment. `cache: "no-store"`
    // forces an uncached fetch on every call instead of trusting revalidate.
    const res = await fetch(BANK_URL, { cache: "no-store" });
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
