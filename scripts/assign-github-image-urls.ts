#!/usr/bin/env tsx
/**
 * Flattens every cropped passage/question image under samples/crops/ into
 * image-assets/{passages,questions}/, and fills in imageUrl on the matching
 * bank.json region(s) with a raw.githubusercontent.com URL pointing at this
 * branch. Used instead of scripts/upload-images.ts (Vercel Blob) when the
 * sandbox can't reach Blob's endpoint — images are hosted directly in the
 * repo instead.
 *
 * Usage:
 *   npm run assign-image-urls -- --owner wesslvc --repo newkice --branch claude/pyeongwon-based-creation-iiex1s
 */
import fs from "fs";
import path from "path";
import type { ImageRegion, QuestionBank } from "../lib/types";

const BANK_PATH = path.join(process.cwd(), "data", "bank.json");
const CROPS_DIR = path.join(process.cwd(), "samples", "crops");
const ASSETS_DIR = path.join(process.cwd(), "image-assets");

function regionFilename(id: string, index: number): string {
  return index === 0 ? `${id}.png` : `${id}__${index}.png`;
}

function parseArgs(argv: string[]) {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      opts[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const owner = opts.owner ?? "wesslvc";
  const repo = opts.repo ?? "newkice";
  const branch = opts.branch ?? "claude/pyeongwon-based-creation-iiex1s";
  const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/image-assets`;

  const bank: QuestionBank = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));

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

  fs.mkdirSync(path.join(ASSETS_DIR, "passages"), { recursive: true });
  fs.mkdirSync(path.join(ASSETS_DIR, "questions"), { recursive: true });

  let copied = 0;
  let missing = 0;

  function assignRegions(id: string, regions: ImageRegion[] | undefined, fileMap: Map<string, string>, prefix: string) {
    if (!regions) return;
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const filename = regionFilename(id, i);
      const key = filename.replace(/\.png$/, "");
      const srcPath = fileMap.get(key);
      if (!srcPath) {
        missing++;
        continue;
      }
      const destPath = path.join(ASSETS_DIR, prefix, filename);
      fs.copyFileSync(srcPath, destPath);
      region.imageUrl = `${baseUrl}/${prefix}/${filename}`;
      copied++;
      if (copied % 500 === 0) console.log(`...${copied} copied`);
    }
  }

  for (const passage of bank.passages) {
    assignRegions(passage.id, passage.regions, passageFiles, "passages");
  }
  for (const question of bank.questions) {
    assignRegions(question.id, question.regions, questionFiles, "questions");
  }

  fs.writeFileSync(BANK_PATH, JSON.stringify(bank, null, 2));
  console.log(`Copied ${copied} images into ${ASSETS_DIR}, missing local file for ${missing}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
