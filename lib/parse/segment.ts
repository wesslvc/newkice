import type { Category, ExamName, ExamSource, Passage, Question, Subject } from "@/lib/types";

// Heuristic text segmenter for 평가원 기출/모의고사 compilation PDFs.
//
// pdf-parse gives back linear text, so a 2-column layout (typical of these
// papers) interleaves left/right column lines. This parser assumes the
// input has already been reflowed into reading order — see README-INGEST.md
// for how to pre-process a real source file, since that step is
// PDF-specific and needs to be tuned against real extracted text.

const CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

const YEAR_EXAM_RE =
  /(\d{4})\s*학년도\s*(대학수학능력시험|(?:6|9)\s*월\s*모의평가|(?:\d{1,2})\s*월\s*학력평가|학력평가)/;

const RANGE_RE = /\[\s*(\d{1,2})\s*[~∼\-]\s*(\d{1,2})\s*\]/;

const QUESTION_START_RE = /^(\d{1,2})\s*\.\s*(.+)$/;

function normalizeExamName(raw: string): ExamName {
  if (raw.includes("수능") || raw.includes("대학수학능력시험")) return "대학수학능력시험";
  if (raw.includes("월") && raw.includes("모의평가")) return raw.trim() as ExamName;
  if (raw.includes("학력평가")) return "학력평가";
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

export function segment(fullText: string, opts: SegmentOptions): SegmentResult {
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

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
    const yearMatch = line.match(YEAR_EXAM_RE);
    if (yearMatch) {
      flushPassage();
      currentSource = {
        year: Number(yearMatch[1]),
        examName: normalizeExamName(yearMatch[2]),
        subject: opts.defaultSubject,
        category: opts.defaultCategory,
        label: line,
      };
      mode = "scan";
      continue;
    }

    const rangeMatch = line.match(RANGE_RE);
    if (rangeMatch) {
      flushPassage();
      currentPassage = {
        id: nextId("psg"),
        source: currentSource,
        paragraphs: [],
        questionRange: [Number(rangeMatch[1]), Number(rangeMatch[2])],
        sourceFileId: opts.sourceFileId,
        sourceFileName: opts.sourceFileName,
      };
      mode = "passage-body";
      continue;
    }

    const questionMatch = line.match(QUESTION_START_RE);
    const looksLikeChoiceLine = CIRCLED.some((c) => line.startsWith(c));

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
        };
        mode = "question-stem";
        continue;
      }
    }

    if (looksLikeChoiceLine && currentQuestion) {
      // A single extracted line can contain multiple circled choices; split on them.
      const parts = line.split(/(?=[①②③④⑤])/).filter(Boolean);
      for (const part of parts) {
        const marker = part[0];
        const idx = CIRCLED.indexOf(marker as (typeof CIRCLED)[number]);
        const text = part.slice(1).trim();
        if (idx >= 0 && text) {
          currentQuestion.choices.push({ no: (idx + 1) as 1 | 2 | 3 | 4 | 5, text });
        }
      }
      mode = "choices";
      continue;
    }

    if (mode === "passage-body" && currentPassage) {
      currentPassage.paragraphs.push(line);
      continue;
    }

    if ((mode === "question-stem" || mode === "choices") && currentQuestion) {
      if (currentQuestion.choices.length === 0) {
        currentQuestion.stem += ` ${line}`;
      } else {
        // Continuation of the previous choice's text (line-wrapped).
        const last = currentQuestion.choices[currentQuestion.choices.length - 1];
        last.text += ` ${line}`;
      }
      continue;
    }

    unmatched.push(line);
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
