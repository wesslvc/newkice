import fs from "fs";

export interface RawPage {
  pageNumber: number;
  text: string;
}

/**
 * Extracts raw text per page from a PDF file.
 *
 * pdf-parse gives us the full-document text; we re-split it by form-feed
 * characters (\f), which pdf-parse inserts between pages, so downstream
 * segmentation can reason about page boundaries when useful.
 */
export async function extractPdfPages(filePath: string): Promise<RawPage[]> {
  const { default: pdfParse } = await import("pdf-parse");
  const buffer = fs.readFileSync(filePath);

  const pages: RawPage[] = [];
  let pageNumber = 0;
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      pageNumber += 1;
      const content = await pageData.getTextContent();
      const text = content.items
        .map((item: unknown) =>
          typeof item === "object" && item !== null && "str" in item
            ? String((item as { str: unknown }).str)
            : ""
        )
        .join("\n");
      pages.push({ pageNumber, text });
      return text;
    },
  });

  return pages;
}
