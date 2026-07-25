#!/usr/bin/env tsx
/**
 * Uploads every cropped passage/question image under samples/crops/ to
 * Vercel Blob, and fills in imageUrl on the matching bank.json region(s).
 * A passage/question that spans a column or page boundary has multiple
 * regions — files are named "<id>.png" (first) and "<id>__N.png" (rest).
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run upload-images
 *
 * NOTE: Vercel Blob's endpoint may not be reachable from every environment
 * (e.g. a sandboxed CI runner with an egress allowlist) — if `put()` fails
 * immediately with a network error, see scripts/assign-github-image-urls.ts
 * for an alternative that hosts images in the repo itself instead.
 */
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";
import type { ImageRegion, QuestionBank } from "../lib/types";

const BANK_PATH = path.join(process.cwd(), "data", "bank.json");
const CROPS_DIR = path.join(process.cwd(), "samples", "crops");

function regionFilename(id: string, index: number): string {
  return index === 0 ? `${id}.png` : `${id}__${index}.png`;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("Missing BLOB_READ_WRITE_TOKEN env var.");
    process.exit(1);
  }

  const bank: QuestionBank = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));

  // Build "<id>.png" / "<id>__N.png" -> local file path by scanning every
  // source-file subfolder under samples/crops/.
  const passageFiles = new Map<string, string>();
  const questionFiles = new Map<string, string>();
  for (const sourceDir of fs.readdirSync(CROPS_DIR)) {
    const passagesDir = path.join(CROPS_DIR, sourceDir, "passages");
    const questionsDir = path.join(CROPS_DIR, sourceDir, "questions");
    if (fs.existsSync(passagesDir)) {
      for (const f of fs.readdirSync(passagesDir)) {
        passageFiles.set(f.replace(/\.png$/, ""), path.join(passagesDir, f));
      }
    }
    if (fs.existsSync(questionsDir)) {
      for (const f of fs.readdirSync(questionsDir)) {
        questionFiles.set(f.replace(/\.png$/, ""), path.join(questionsDir, f));
      }
    }
  }

  let uploaded = 0;
  let skipped = 0;
  let missing = 0;

  async function uploadRegions(id: string, regions: ImageRegion[] | undefined, fileMap: Map<string, string>, prefix: string) {
    if (!regions) return;
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      if (region.imageUrl) {
        skipped++;
        continue;
      }
      const key = regionFilename(id, i).replace(/\.png$/, "");
      const filePath = fileMap.get(key);
      if (!filePath) {
        missing++;
        continue;
      }
      const buffer = fs.readFileSync(filePath);
      const blob = await put(`${prefix}/${regionFilename(id, i)}`, buffer, {
        access: "public",
        token,
        contentType: "image/png",
        addRandomSuffix: false,
      });
      region.imageUrl = blob.url;
      uploaded++;
      if (uploaded % 25 === 0) console.log(`...${uploaded} uploaded`);
    }
  }

  for (const passage of bank.passages) {
    await uploadRegions(passage.id, passage.regions, passageFiles, "passages");
  }
  for (const question of bank.questions) {
    await uploadRegions(question.id, question.regions, questionFiles, "questions");
  }

  fs.writeFileSync(BANK_PATH, JSON.stringify(bank, null, 2));
  console.log(`Uploaded ${uploaded}, skipped ${skipped} (already had imageUrl), missing local file for ${missing}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
