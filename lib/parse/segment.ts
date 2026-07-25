import type { Category, ExamName, ExamSource, ImageRegion, Passage, Question, Subject } from "@/lib/types";
import type { PositionedLine } from "@/lib/parse/pdf-columns";

// Heuristic text segmenter for 평가원 기출/모의고사 compilation PDFs.
//
// Operates on PositionedLine[] (see pdf-columns.ts) rather than plain text:
// each line carries its PDF-space bounding box, so as passages/questions are
// assembled we also union those boxes into a crop region (ImageRegion) —
// letting the generator show the *original* page image instead of
// re-typeset text.

const CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

const YEAR_EXAM_RE =
  /(\d{4})\s*학년도\s*(대학수학능력시험|(?:6|9)\s*월\s*모의평가|(?:\d{1,2})\s*월\s*학력평가|학력평가)/;

const RANGE_RE = /[\[［]\s*(\d{1,2})\s*[~∼～\-]\s*(\d{1,2})\s*[\]］]/;

const QUESTION_START_RE = /^(\d{1,2})\s*\.\s*(.+)$/;

// 통합 국어 시험지의 선택과목 구간은 본문에 "(화법과 작문)" / "(언어와 매체)" 같은
// 괄호 표기 소제목으로 명시된다. 독서·문학은 공통 과목이라 이런 라벨이 없는 경우가
// 많아 defaultCategory로만 구분한다 — 실제 파일로 더 검증이 필요한 부분.
const CATEGORY_RE = /^[\(（]\s*(화법과\s*작문|언어와\s*매체|독서|문학|화법과\s*언어)\s*[\)）]$/;

function normalizeExamName(raw: string): ExamName {
  if (raw.includes("수능") || raw.includes("대학수학능력시험")) return "대학수학능력시험";
  if (raw.includes("월") && raw.includes("모의평가")) return raw.trim() as ExamName;
  if (raw.includes("학력평가")) return "학력평가";
  return "기타";
}

function normalizeCategory(raw: string): Category {
  const clean = raw.replace(/\s+/g, "");
  if (clean === "화법과작문") return "화법과작문";
  if (clean === "언어와매체") return "언어와매체";
  if (clean === "화법과언어") return "화법과언어";
  if (clean === "독서") return "독서";
  if (clean === "문학") return "문학";
  return "기타";
}

export interface SegmentOptions {
  defaultSubject: Subject;
  defaultCategory: Category;
  sourceFileId?: string;
  sourceFileName?: string;
}

export interface SegmentResult {
  passages: Passage[];
  questions: Question[];
  /** Lines the parser could not confidently classify — inspect to tune the regexes above. */
  unmatched: string[];
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function unionRegion(region: ImageRegion | undefined, line: PositionedLine): ImageRegion {
  if (!region || region.pageNumber !== line.pageNumber) {
    // Passage/question crossing a page break: keep the first page's box
    // rather than corrupting it with coordinates from a different page.
    return region ?? { pageNumber: line.pageNumber, bbox: { ...line.bbox } };
  }
  return {
    pageNumber: region.pageNumber,
    bbox: {
      x0: Math.min(region.bbox.x0, line.bbox.x0),
      x1: Math.max(region.bbox.x1, line.bbox.x1),
      y0: Math.min(region.bbox.y0, line.bbox.y0),
      y1: Math.max(region.bbox.y1, line.bbox.y1),
    },
  };
}

/** See flushQuestion(): recovers choices printed as "…text…①" (trailing marker). */
function extractTrailingChoices(stem: string): { stem: string; choices: import("@/lib/types").Choice[] } | null {
  const matches = [...stem.matchAll(/([\s\S]*?)([①②③④⑤])/g)];
  if (matches.length < 5) return null;
  const last5 = matches.slice(-5);
  const expected: (typeof CIRCLED)[number][] = ["①", "②", "③", "④", "⑤"];
  if (!last5.every((m, i) => m[2] === expected[i])) return null;

  const choices = last5.map((m, i) => ({ no: (i + 1) as 1 | 2 | 3 | 4 | 5, text: m[1].trim() }));
  const headEnd = last5[0].index ?? 0;
  return { stem: stem.slice(0, headEnd).trim(), choices };
}

export function segment(positionedLines: PositionedLine[], opts: SegmentOptions): SegmentResult {
  const lines = positionedLines.filter((l) => l.text.trim().length > 0);

  const passages: Passage[] = [];
  const questions: Question[] = [];
  const unmatched: string[] = [];

  let currentSource: ExamSource = {
    year: 0,
    examName: "기타",
    subject: opts.defaultSubject,
    category: opts.defaultCategory,
    label: "",
  };

  let currentPassage: Passage | null = null;
  let currentQuestion: Question | null = null;
  let mode: "scan" | "passage-body" | "question-stem" | "choices" = "scan";

  const flushQuestion = () => {
    if (currentQuestion && currentQuestion.choices.length === 0) {
      // Some question types (e.g. 화법과 작문 목록형 문항) print each choice
      // as "…설명 텍스트…①" with the circled digit trailing the option's
      // own text rather than leading it. Retry as a fallback before giving up.
      const fallback = extractTrailingChoices(currentQuestion.stem);
      if (fallback) {
        currentQuestion.stem = fallback.stem;
        currentQuestion.choices = fallback.choices;
      }
    }
    if (currentQuestion && currentQuestion.choices.length > 0) {
      questions.push(currentQuestion);
    } else if (currentQuestion) {
      unmatched.push(`[dropped incomplete question #${currentQuestion.originalNo}] ${currentQuestion.stem}`);
    }
    currentQuestion = null;
  };

  const flushPassage = () => {
    flushQuestion();
    if (currentPassage && currentPassage.paragraphs.length > 0) {
      passages.push(currentPassage);
    }
    currentPassage = null;
  };

  for (const line of lines) {
    const text = line.text;

    const yearMatch = text.match(YEAR_EXAM_RE);
    if (yearMatch) {
      flushPassage();
      currentSource = {
        year: Number(yearMatch[1]),
        examName: normalizeExamName(yearMatch[2]),
        subject: opts.defaultSubject,
        category: opts.defaultCategory,
        label: text,
      };
      mode = "scan";
      continue;
    }

    const categoryMatch = text.match(CATEGORY_RE);
    if (categoryMatch) {
      currentSource = { ...currentSource, category: normalizeCategory(categoryMatch[1]) };
      continue;
    }

    const rangeMatch = text.match(RANGE_RE);
    if (rangeMatch) {
      flushPassage();
      currentPassage = {
        id: nextId("psg"),
        source: currentSource,
        paragraphs: [],
        questionRange: [Number(rangeMatch[1]), Number(rangeMatch[2])],
        sourceFileId: opts.sourceFileId,
        sourceFileName: opts.sourceFileName,
        region: { pageNumber: line.pageNumber, bbox: { ...line.bbox } },
      };
      mode = "passage-body";
      continue;
    }

    const questionMatch = text.match(QUESTION_START_RE);
    const looksLikeChoiceLine = CIRCLED.some((c) => text.startsWith(c));

    if (questionMatch && !looksLikeChoiceLine) {
      const no = Number(questionMatch[1]);
      const inRange =
        !currentPassage ||
        (no >= currentPassage.questionRange[0] && no <= currentPassage.questionRange[1] + 3);
      if (inRange) {
        flushQuestion();
        currentQuestion = {
          id: nextId("q"),
          passageId: currentPassage?.id ?? null,
          originalNo: no,
          stem: questionMatch[2],
          choices: [],
          answer: 1, // placeholder — filled in by applyAnswerKey()
          region: { pageNumber: line.pageNumber, bbox: { ...line.bbox } },
          numberMaskWidth: line.contentX0 !== undefined ? line.contentX0 - line.bbox.x0 : undefined,
        };
        mode = "question-stem";
        continue;
      }
    }

    if (looksLikeChoiceLine && currentQuestion) {
      // A single extracted line can contain multiple circled choices; split on them.
      const parts = text.split(/(?=[①②③④⑤])/).filter(Boolean);
      for (const part of parts) {
        const marker = part[0];
        const idx = CIRCLED.indexOf(marker as (typeof CIRCLED)[number]);
        const choiceText = part.slice(1).trim();
        if (idx >= 0 && choiceText) {
          currentQuestion.choices.push({ no: (idx + 1) as 1 | 2 | 3 | 4 | 5, text: choiceText });
        }
      }
      currentQuestion.region = unionRegion(currentQuestion.region, line);
      mode = "choices";
      continue;
    }

    // Page-footer noise (bare page numbers, e.g. "1 11" or "20") that ends
    // up on its own line after column reflow. Drop it rather than glue it
    // onto whatever text happens to be accumulating.
    if (/^[\d\s]{1,6}$/.test(text)) {
      unmatched.push(text);
      continue;
    }

    if (mode === "passage-body" && currentPassage) {
      currentPassage.paragraphs.push(text);
      currentPassage.region = unionRegion(currentPassage.region, line);
      continue;
    }

    if ((mode === "question-stem" || mode === "choices") && currentQuestion) {
      if (currentQuestion.choices.length === 0) {
        currentQuestion.stem += ` ${text}`;
      } else {
        // Continuation of the previous choice's text (line-wrapped).
        const last = currentQuestion.choices[currentQuestion.choices.length - 1];
        last.text += ` ${text}`;
      }
      currentQuestion.region = unionRegion(currentQuestion.region, line);
      continue;
    }

    unmatched.push(text);
  }

  flushPassage();

  return { passages, questions, unmatched };
}

/**
 * Applies an externally-sourced answer key (originalNo -> answer) onto parsed
 * questions. 평가원 compilations almost always print the answer key as a
 * separate table rather than inline, so this is a deliberate second pass —
 * see parseAnswerKeyTable().
 */
export function applyAnswerKey(
  questions: Question[],
  answers: Map<number, 1 | 2 | 3 | 4 | 5>
): { applied: number; missing: number[] } {
  let applied = 0;
  const missing: number[] = [];
  for (const q of questions) {
    const a = answers.get(q.originalNo);
    if (a) {
      q.answer = a;
      applied += 1;
    } else {
      missing.push(q.originalNo);
    }
  }
  return { applied, missing };
}

/** Parses a simple answer-key table like "1 ② 2 ④ 3 ① 4 ⑤ ..." into a map. */
export function parseAnswerKeyTable(text: string): Map<number, 1 | 2 | 3 | 4 | 5> {
  const map = new Map<number, 1 | 2 | 3 | 4 | 5>();
  const tokenRe = /(\d{1,2})\s*([①②③④⑤])/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    const no = Number(m[1]);
    const idx = CIRCLED.indexOf(m[2] as (typeof CIRCLED)[number]);
    map.set(no, (idx + 1) as 1 | 2 | 3 | 4 | 5);
  }
  return map;
}
