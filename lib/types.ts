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
