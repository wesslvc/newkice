import type {
  AssembledPaper,
  ExamSource,
  GenerationRequest,
  Passage,
  Question,
  QuestionBank,
} from "@/lib/types";

const FALLBACK_SOURCE: ExamSource = {
  year: 0,
  examName: "기타",
  subject: "국어",
  category: "기타",
  label: "",
};

/**
 * Assembles a GenerationRequest (an ordered list of selected question ids)
 * into a printable paper: groups questions back under their passage,
 * renumbers everything sequentially from 1, and builds the answer key in
 * the same order.
 */
export function assemble(bank: QuestionBank, req: GenerationRequest): AssembledPaper {
  const questionMap = new Map(bank.questions.map((q) => [q.id, q]));
  const passageMap = new Map(bank.passages.map((p) => [p.id, p]));

  const selected = req.items
    .map((item) => questionMap.get(item.questionId))
    .filter((q): q is Question => Boolean(q));

  // Group by passage, preserving the order in which each group first
  // appears in the selection. Standalone questions (no passage) get their
  // own single-question group.
  const order: string[] = [];
  const groups = new Map<string, Question[]>();
  for (const q of selected) {
    const key = q.passageId ?? `standalone:${q.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(q);
  }

  let displayNo = 1;
  const passages: AssembledPaper["passages"] = [];
  const answerKey: AssembledPaper["answerKey"] = [];

  for (const key of order) {
    const groupQuestions = groups.get(key)!.slice().sort((a, b) => a.originalNo - b.originalNo);
    const passage: Passage | null = key.startsWith("standalone:") ? null : passageMap.get(key) ?? null;

    const assembledQuestions = groupQuestions.map((q) => {
      const assigned = displayNo++;
      answerKey.push({ displayNo: assigned, answer: q.answer });
      return { ...q, displayNo: assigned };
    });

    passages.push({
      id: passage?.id ?? key,
      source: passage?.source ?? FALLBACK_SOURCE,
      title: passage?.title,
      paragraphs: passage?.paragraphs ?? [],
      sourceFileId: passage?.sourceFileId,
      sourceFileName: passage?.sourceFileName,
      regions: passage?.regions,
      questions: assembledQuestions,
    });
  }

  return { title: req.title, subtitle: req.subtitle, passages, answerKey };
}
