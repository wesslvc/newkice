import fs from "fs";

// 평가원 문제지는 거의 항상 2단(좌/우 컬럼) 편집이다. pdf-parse의 기본 추출은
// 텍스트를 선형으로 뽑아내면서 두 컬럼을 섞어버리므로, 좌표 기반으로 컬럼을
// 분리해 읽기 순서(왼쪽 컬럼 위→아래, 오른쪽 컬럼 위→아래)로 재정렬한다.
//
// NOTE: 실제 원본 PDF로 검증되지 않은 휴리스틱이다. 실제 파일을 넣어보고
// 컬럼 경계 판정(hasGutter)과 줄 묶기(yTolerance)를 튜닝해야 한다.

export interface ReflowedPage {
  pageNumber: number;
  text: string;
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

function groupIntoLines(items: PositionedItem[], yTolerance = 3): string[] {
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
  return lines.map((l) =>
    l.items
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join("")
  );
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
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
      }
    }

    if (items.length === 0) {
      pages.push({ pageNumber: pageNum, text: "" });
      continue;
    }

    const pageWidth = viewport.width;
    const mid = pageWidth / 2;
    const gutterBand = pageWidth * 0.06;

    const leftItems = items.filter((i) => i.x < mid);
    const rightItems = items.filter((i) => i.x >= mid);

    // Only treat the page as two columns if both halves have real content
    // AND nothing straddles the center gutter (which would mean it's
    // actually a single wide column, e.g. a cover or answer-key page).
    const hasGutter =
      leftItems.length > 5 &&
      rightItems.length > 5 &&
      !items.some((i) => i.x < mid + gutterBand / 2 && i.x + i.width > mid - gutterBand / 2 && i.width > gutterBand);

    const text = hasGutter
      ? [...groupIntoLines(leftItems), ...groupIntoLines(rightItems)].join("\n")
      : groupIntoLines(items).join("\n");

    pages.push({ pageNumber: pageNum, text });
  }

  return pages;
}
