#!/usr/bin/env tsx
/**
 * Ingest a source PDF (a real 평가원 기출/모의고사 compilation) into the
 * structured question bank at data/bank.json.
 *
 * Usage:
 *   npm run ingest -- <path-to-pdf> --subject 국어 --category 독서 \
 *     [--answers <path-to-answer-key.txt>] [--naive]
 *
 * --answers should point at a plain-text dump of the printed answer-key
 * table (e.g. "1 ② 2 ④ 3 ① ..."). Without it, questions are stored with a
 * placeholder answer and a warning — do not generate a paper from them
 * until verified.
 *
 * --naive skips the column-aware reflow (lib/parse/pdf-columns.ts) and uses
 * pdf-parse's default linear extraction instead. Useful as a fallback if the
 * column heuristic misfires on a given file.
 */
import fs from "fs";
import path from "path";
import { extractReflowedPages } from "../lib/parse/pdf-columns";
import { extractPdfPages } from "../lib/parse/text";
import { applyAnswerKey, parseAnswerKeyTable, segment } from "../lib/parse/segment";
import type { Category, QuestionBank, Subject } from "../lib/types";

const BANK_PATH = path.join(process.cwd(), "data", "bank.json");

function parseArgs(argv: string[]) {
  const [file, ...rest] = argv;
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }
  return { file, opts };
}

async function main() {
  const { file, opts } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error(
      "Usage: npm run ingest -- <path-to-pdf> --subject 국어 --category 독서 [--answers <file>] [--naive]"
    );
    process.exit(1);
  }

  const subject = (opts.subject as Subject) ?? "국어";
  const category = (opts.category as Category) ?? "기타";

  console.log(`Extracting text from ${file} (${opts.naive ? "naive" : "column-aware"} mode)...`);
  const pages = opts.naive ? await extractPdfPages(file) : await extractReflowedPages(file);
  const fullText = pages.map((p) => p.text).join("\n");

  console.log(`Segmenting ${pages.length} pages of extracted text...`);
  const result = segment(fullText, {
    defaultSubject: subject,
    defaultCategory: category,
    sourceFileName: path.basename(file),
  });

  console.log(`Parsed ${result.passages.length} passages, ${result.questions.length} questions.`);
  if (result.unmatched.length > 0) {
    fs.writeFileSync("ingest-debug.txt", result.unmatched.join("\n"));
    console.log(
      `${result.unmatched.length} unmatched lines written to ingest-debug.txt — inspect these to tune lib/parse/segment.ts.`
    );
  }

  if (opts.answers) {
    const answerText = fs.readFileSync(opts.answers as string, "utf-8");
    const answerMap = parseAnswerKeyTable(answerText);
    const { applied, missing } = applyAnswerKey(result.questions, answerMap);
    console.log(`Applied answers to ${applied} questions. Missing: ${missing.join(", ") || "none"}`);
  } else {
    console.warn(
      "WARNING: no --answers file given. Parsed questions carry a placeholder answer " +
        "and must not be used in a generated paper until verified against the real answer key."
    );
  }

  let bank: QuestionBank = { generatedAt: new Date().toISOString(), passages: [], questions: [] };
  if (fs.existsSync(BANK_PATH)) {
    bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
  }
  bank.generatedAt = new Date().toISOString();
  bank.passages.push(...result.passages);
  bank.questions.push(...result.questions);

  fs.mkdirSync(path.dirname(BANK_PATH), { recursive: true });
  fs.writeFileSync(BANK_PATH, JSON.stringify(bank, null, 2));
  console.log(
    `Wrote ${BANK_PATH} — ${bank.passages.length} passages, ${bank.questions.length} questions total.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
