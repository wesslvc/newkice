// Core data model for the exam bank and generator.

export type Subject =
  | "국어"
  | "수학"
  | "영어"
  | "한국사"
  | "사회탐구"
  | "과학탐구"
  | "직업탐구"
  | "제2외국어/한문";

// 국어 영역 세부 갈래. Other subjects can extend this union as ingested.
export type Category =
  | "독서"
  | "문학"
  | "화법과작문"
  | "언어와매체"
  | "화법과언어"
  | "기타";

export type ExamName =
  | "대학수학능력시험"
  | "6월 모의평가"
  | "9월 모의평가"
  | "학력평가"
  | "기타";

export interface ExamSource {
  year: number; // 학년도 (e.g. 2025)
  examName: ExamName;
  subject: Subject;
  category: Category;
  /** Free-text label as printed on the original paper, e.g. "2025학년도 대학수학능력시험" */
  label: string;
}

export interface Choice {
  no: 1 | 2 | 3 | 4 | 5;
  text: string;
}

/** Where a region was cropped from in the source PDF — lets the generator re-crop from the original page image instead of re-typesetting text. */
export interface ImageRegion {
  pageNumber: number;
  /** PDF point-space bounding box, origin bottom-left, y increasing upward. */
  bbox: { x0: number; x1: number; y0: number; y1: number };
  /** Public URL (e.g. Vercel Blob) of the cropped image, once uploaded. */
  imageUrl?: string;
}

export interface Question {
  id: string;
  /** id of the Passage this question is attached to, or null for a standalone item (e.g. 화법과작문). */
  passageId: string | null;
  /** Question number as printed in the original source paper. */
  originalNo: number;
  stem: string;
  choices: Choice[];
  answer: 1 | 2 | 3 | 4 | 5;
  points?: number;
  difficulty?: "상" | "중" | "하";
  tags?: string[];
  /** Crop region for the original-image rendering of this question (stem + choices, including the original number label). */
  region?: ImageRegion;
  /**
   * Width (in PDF points, from the region's left edge) of the original
   * "12." number label at the start of the first line — wide enough for
   * the generator to paint over it and draw a freshly assigned number on
   * top, without needing to re-typeset the whole question.
   */
  numberMaskWidth?: number;
}

export interface Passage {
  id: string;
  source: ExamSource;
  title?: string;
  /** Paragraphs, in reading order. */
  paragraphs: string[];
  /** Original question numbering range this passage covers, e.g. [1, 3]. */
  questionRange: [number, number];
  /** Reference back to the source file this was ingested from, if known. */
  sourceFileId?: string;
  sourceFileName?: string;
  /** Crop region for the original-image rendering of this passage. */
  region?: ImageRegion;
}

export interface QuestionBank {
  generatedAt: string;
  passages: Passage[];
  questions: Question[];
}

// --- Generation ---

export interface SelectedItem {
  questionId: string;
}

export interface GenerationRequest {
  title: string;
  subtitle?: string;
  items: SelectedItem[];
}

export interface AssembledQuestion extends Question {
  /** Sequential number assigned in the generated paper (1-based). */
  displayNo: number;
}

export interface AssembledPassage extends Omit<Passage, "questionRange"> {
  questions: AssembledQuestion[];
}

export interface AssembledPaper {
  title: string;
  subtitle?: string;
  passages: AssembledPassage[];
  /** displayNo -> answer, in paper order. */
  answerKey: { displayNo: number; answer: 1 | 2 | 3 | 4 | 5 }[];
}
