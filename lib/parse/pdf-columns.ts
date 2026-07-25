import fs from "fs";

// 평가원 문제지는 거의 항상 2단(좌/우 컬럼) 편집이다. pdf.js의 텍스트 콘텐츠는
// 컬럼 구분 없이 아이템을 반환하므로, 좌표 기반으로 컬럼을 분리해 읽기 순서
// (왼쪽 컬럼 위→아래, 오른쪽 컬럼 위→아래)로 재정렬한다.
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
  /**
   * Which column this line came from, when the page has a detected 2-column
   * gutter ("single" if the page wasn't split). segment.ts uses this to
   * detect when a passage/question crosses a column or page boundary, so it
   * can crop each side separately instead of losing the overflow.
   */
  column: "left" | "right" | "single";
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
 * Finds the x-coordinate of the column gutter.
 *
 * The first pass gathers every gap between consecutive item left-edges
 * within the middle portion of the page as a *candidate* gutter — a gap in
 * start-x positions is a decent signal, but on some pages (a sparse title
 * page, a page with a full-width diagram/notice box) a coincidental gap
 * unrelated to the real column boundary can be just as wide, or wider,
 * than the true gutter, and picking the single widest one by a hair
 * (sometimes <1pt) picks the wrong one.
 *
 * The second pass disambiguates between candidates by checking how well
 * each is *confirmed* by the rest of the page: group items into text rows,
 * then for each candidate band [lo, hi], count rows that have content on
 * both sides of the band (confirming — this row really does span two
 * columns with this gutter) versus rows where some item's rendered extent
 * actually crosses into the band (violating — this can't be a real blank
 * gutter here). The real column boundary is a vertical band that stays
 * clear across most of the page, so it wins on confirming/violating even
 * when its raw x0-to-x0 gap is narrower than a one-off coincidental gap.
 */
function findColumnGutter(items: PositionedItem[], pageWidth: number): number | null {
  const centerLo = pageWidth * 0.3;
  const centerHi = pageWidth * 0.7;
  const xs = items.map((i) => i.x).sort((a, b) => a - b);

  const candidates: { gap: number; mid: number; lo: number; hi: number }[] = [];
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    const mid = (xs[i] + xs[i - 1]) / 2;
    if (mid >= centerLo && mid <= centerHi && gap > pageWidth * 0.015) {
      candidates.push({ gap, mid, lo: xs[i - 1], hi: xs[i] });
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].mid;

  const rows: { items: PositionedItem[] }[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const last = rows[rows.length - 1];
    const lastY = last ? last.items[last.items.length - 1].y : null;
    if (last && lastY !== null && Math.abs(lastY - item.y) <= 3) {
      last.items.push(item);
    } else {
      rows.push({ items: [item] });
    }
  }

  function score(c: { lo: number; hi: number }): number {
    let confirming = 0;
    let violating = 0;
    for (const row of rows) {
      const crosses = row.items.some((it) => it.x < c.hi && it.x + it.width > c.lo);
      if (crosses) {
        violating++;
        continue;
      }
      const rowMinX = Math.min(...row.items.map((it) => it.x));
      const rowMaxX = Math.max(...row.items.map((it) => it.x + it.width));
      if (rowMinX < c.lo && rowMaxX > c.hi) confirming++;
    }
    return confirming - violating * 5;
  }

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = score(c);
    if (s > bestScore || (s === bestScore && c.gap > best.gap)) {
      bestScore = s;
      best = c;
    }
  }
  return best.mid;
}

function groupIntoLines(
  items: PositionedItem[],
  pageNumber: number,
  column: "left" | "right" | "single",
  gutter: number | null,
  yTolerance = 3
): PositionedLine[] {
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
    let x0 = Math.min(...ordered.map((i) => i.x));
    let x1 = Math.max(...ordered.map((i) => i.x + i.width));
    const y0 = Math.min(...ordered.map((i) => i.y));
    const y1 = Math.max(...ordered.map((i) => i.y + i.height));
    const text = ordered.map((i) => i.str).join("");

    // A single text run can straddle the gutter (e.g. a full-width notice
    // line printed across both columns) even though its start-x placed it
    // in this bucket. Clamp the crop box to this column's own side so it
    // never bleeds into the other column's content.
    if (gutter !== null) {
      if (column === "left") x1 = Math.min(x1, gutter);
      else if (column === "right") x0 = Math.max(x0, gutter);
    }

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
      column,
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
            ...groupIntoLines(items.filter((i) => i.x < gutter), pageNum, "left", gutter),
            ...groupIntoLines(items.filter((i) => i.x >= gutter), pageNum, "right", gutter),
          ]
        : groupIntoLines(items, pageNum, "single", null);

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
