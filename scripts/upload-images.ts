#!/usr/bin/env tsx
/**
 * Uploads every cropped passage/question image under samples/crops/ to
 * Vercel Blob, and fills in region.imageUrl on the matching bank.json
 * entries.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run upload-images
 */
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";
import type { QuestionBank } from "../lib/types";

const BANK_PATH = path.join(process.cwd(), "data", "bank.json");
const CROPS_DIR = path.join(process.cwd(), "samples", "crops");

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("Missing BLOB_READ_WRITE_TOKEN env var.");
    process.exit(1);
  }

  const bank: QuestionBank = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));

  // Build id -> local crop file path by scanning every source-file subfolder.
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

  for (const passage of bank.passages) {
    if (passage.region?.imageUrl) {
      skipped++;
      continue;
    }
    const filePath = passageFiles.get(passage.id);
    if (!filePath) {
      missing++;
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const blob = await put(`passages/${passage.id}.png`, buffer, {
      access: "public",
      token,
      contentType: "image/png",
      addRandomSuffix: false,
    });
    passage.region = { ...passage.region!, imageUrl: blob.url };
    uploaded++;
    if (uploaded % 25 === 0) console.log(`...${uploaded} uploaded`);
  }

  for (const question of bank.questions) {
    if (question.region?.imageUrl) {
      skipped++;
      continue;
    }
    const filePath = questionFiles.get(question.id);
    if (!filePath) {
      missing++;
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const blob = await put(`questions/${question.id}.png`, buffer, {
      access: "public",
      token,
      contentType: "image/png",
      addRandomSuffix: false,
    });
    question.region = { ...question.region!, imageUrl: blob.url };
    uploaded++;
    if (uploaded % 25 === 0) console.log(`...${uploaded} uploaded`);
  }

  fs.writeFileSync(BANK_PATH, JSON.stringify(bank, null, 2));
  console.log(`Uploaded ${uploaded}, skipped ${skipped} (already had imageUrl), missing local file for ${missing}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
