import fs from "fs";

// 평가원 문제지는 거의 항상 2단(좌/우 컬럼) 편집이다. pdf-parse의 기본 추출은
// 텍스트를 선형으로 뽑아내면서 두 컬럼을 섞어버리므로, 좌표 기반으로 컬럼을
// 분리해 읽기 순서(왼쪽 컬럼 위→아래, 오른쪽 컬럼 위→아래)로 재정렬한다.
//
// 각 줄(line)은 텍스트뿐 아니라 원본 PDF 좌표계(원점 좌하단, y 위로 증가)의
// bounding box도 함께 들고 있다 — segment.ts가 지문/문항 단위로 이 박스들을
// 합쳐서, 나중에 원본 페이지 이미지에서 해당 영역을 그대로 잘라낼 수 있게 한다.

export interface BBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface PositionedLine {
  pageNumber: number;
  text: string;
  bbox: BBox;
  /**
   * x-coordinate right after a leading "12." question-number prefix, if this
   * line starts with one. Lets a consumer crop the number out of an image
   * region (so a freshly-rendered number can be overlaid instead).
   */
  contentX0?: number;
}

export interface ReflowedPage {
  pageNumber: number;
  text: string;
  lines: PositionedLine[];
  widthPt: number;
  heightPt: number;
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds the x-coordinate of the column gutter by locating the widest gap
 * between consecutive item left-edges within the middle portion of the page.
 * Using item *widths* to detect a "straddling" item (an earlier approach)
 * is unreliable — pdf.js often returns multi-character/word runs as a single
 * item, so a normal line of text can easily have an item wide enough to
 * trip a width-based check. A gap in start-x positions is a much more
 * direct signal of an actual empty gutter.
 */
function findColumnGutter(items: PositionedItem[], pageWidth: number): number | null {
  const centerLo = pageWidth * 0.3;
  const centerHi = pageWidth * 0.7;
  const xs = items.map((i) => i.x).sort((a, b) => a - b);

  let bestGap = 0;
  let bestMid: number | null = null;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    const mid = (xs[i] + xs[i - 1]) / 2;
    if (mid >= centerLo && mid <= centerHi && gap > bestGap) {
      bestGap = gap;
      bestMid = mid;
    }
  }

  return bestGap > pageWidth * 0.015 ? bestMid : null;
}

function groupIntoLines(items: PositionedItem[], pageNumber: number, yTolerance = 3): PositionedLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PositionedItem[] }[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= yTolerance) {
      last.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.map((l) => {
    const ordered = l.items.slice().sort((a, b) => a.x - b.x);
    const x0 = Math.min(...ordered.map((i) => i.x));
    const x1 = Math.max(...ordered.map((i) => i.x + i.width));
    const y0 = Math.min(...ordered.map((i) => i.y));
    const y1 = Math.max(...ordered.map((i) => i.y + i.height));
    const text = ordered.map((i) => i.str).join("");

    // If this line opens with "12.", find the x-position right after that
    // prefix by walking items in reading order until enough characters have
    // accumulated to cover the matched prefix.
    let contentX0: number | undefined;
    const prefixMatch = text.match(/^(\d{1,2}\.)/);
    if (prefixMatch) {
      const prefixLen = prefixMatch[1].length;
      let consumed = 0;
      for (const it of ordered) {
        consumed += it.str.length;
        if (consumed >= prefixLen) {
          contentX0 = it.x + it.width;
          break;
        }
      }
    }

    return {
      pageNumber,
      text,
      bbox: { x0, x1, y0, y1 },
      contentX0,
    };
  });
}

export async function extractReflowedPages(filePath: string): Promise<ReflowedPage[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const pages: ReflowedPage[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PositionedItem[] = [];
    for (const it of content.items) {
      if ("str" in it && typeof it.str === "string" && it.str.trim().length > 0) {
        items.push({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          height: it.height,
        });
      }
    }

    if (items.length === 0) {
      pages.push({ pageNumber: pageNum, text: "", lines: [], widthPt: viewport.width, heightPt: viewport.height });
      continue;
    }

    const pageWidth = viewport.width;
    const gutter = findColumnGutter(items, pageWidth);

    const lines =
      gutter !== null
        ? [
            ...groupIntoLines(items.filter((i) => i.x < gutter), pageNum),
            ...groupIntoLines(items.filter((i) => i.x >= gutter), pageNum),
          ]
        : groupIntoLines(items, pageNum);

    pages.push({
      pageNumber: pageNum,
      text: lines.map((l) => l.text).join("\n"),
      lines,
      widthPt: viewport.width,
      heightPt: viewport.height,
    });
  }

  return pages;
}
