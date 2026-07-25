#!/usr/bin/env tsx
/**
 * Ingest a source PDF (a real 평가원 기출/모의고사 compilation) into the
 * structured question bank at data/bank.json, and crop an original-page
 * image for every passage and question into samples/crops/.
 *
 * Usage:
 *   npm run ingest -- <path-to-pdf> --subject 국어 --category 독서 \
 *     [--answers <path-to-answer-key.txt>] [--scale 3]
 *
 * --answers should point at a plain-text dump of the printed answer-key
 * table (e.g. "1 ② 2 ④ 3 ① ..."). Without it, questions are stored with a
 * placeholder answer and a warning — do not generate a paper from them
 * until verified.
 *
 * Image crops are saved locally (gitignored — see scripts/upload-images.ts
 * for pushing them to Vercel Blob and filling in Question/Passage.region.imageUrl).
 */
import fs from "fs";
import path from "path";
import { extractReflowedPages } from "../lib/parse/pdf-columns";
import { applyAnswerKey, parseAnswerKeyTable, segment } from "../lib/parse/segment";
import { loadPdf, renderPageToImage, cropToPng } from "../lib/parse/pdf-images";
import type { Category, ImageRegion, QuestionBank, Subject } from "../lib/types";

const BANK_PATH = path.join(process.cwd(), "data", "bank.json");
const CROPS_DIR = path.join(process.cwd(), "samples", "crops");

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
      "Usage: npm run ingest -- <path-to-pdf> --subject 국어 --category 독서 [--answers <file>] [--scale 3]"
    );
    process.exit(1);
  }

  const subject = (opts.subject as Subject) ?? "국어";
  const category = (opts.category as Category) ?? "기타";
  const scale = opts.scale ? Number(opts.scale) : 3;

  console.log(`Extracting text + coordinates from ${file}...`);
  const pages = await extractReflowedPages(file);
  const allLines = pages.flatMap((p) => p.lines);

  console.log(`Segmenting ${pages.length} pages (${allLines.length} lines)...`);
  const result = segment(allLines, {
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

  // --- Crop original-page images for every passage/question region ---
  const stem = path.basename(file).replace(/\.pdf$/i, "");
  const outDir = path.join(CROPS_DIR, stem);
  fs.mkdirSync(path.join(outDir, "passages"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "questions"), { recursive: true });

  console.log(`Rendering pages at ${scale}x for cropping...`);
  const doc = await loadPdf(file);
  const pageCache = new Map<number, Awaited<ReturnType<typeof renderPageToImage>>>();

  async function getPage(pageNumber: number) {
    let cached = pageCache.get(pageNumber);
    if (!cached) {
      cached = await renderPageToImage(doc, pageNumber, scale);
      pageCache.set(pageNumber, cached);
    }
    return cached;
  }

  // A passage/question that spans a column or page boundary has more than
  // one region — crop each separately (first one keeps the plain "<id>.png"
  // name for backward compatibility, later ones get a "__N" suffix) so the
  // generator can stack them in order instead of losing the overflow.
  async function cropRegions(id: string, regions: ImageRegion[], dir: string) {
    let n = 0;
    for (const region of regions) {
      const p = await getPage(region.pageNumber);
      const png = cropToPng(p, region.bbox, scale);
      const filename = n === 0 ? `${id}.png` : `${id}__${n}.png`;
      fs.writeFileSync(path.join(dir, filename), png);
      n++;
    }
    return n;
  }

  let cropped = 0;
  let multiRegionCount = 0;
  for (const passage of result.passages) {
    if (!passage.regions || passage.regions.length === 0) continue;
    if (passage.regions.length > 1) multiRegionCount++;
    cropped += await cropRegions(passage.id, passage.regions, path.join(outDir, "passages"));
  }
  for (const question of result.questions) {
    if (!question.regions || question.regions.length === 0) continue;
    if (question.regions.length > 1) multiRegionCount++;
    cropped += await cropRegions(question.id, question.regions, path.join(outDir, "questions"));
  }
  console.log(
    `Cropped ${cropped} images into ${outDir} (${multiRegionCount} items spanned a column/page boundary and got multiple segments)`
  );

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
