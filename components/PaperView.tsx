import type { AssembledPaper, AssembledQuestion } from "@/lib/types";
import type { ReactNode } from "react";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * A4 canvas with a permanent left/right divider — 평가원 문제지는 항상 2단
 * 구성이므로, 이 페이지에서 실제로 쓰는 쪽이 한쪽뿐이더라도 구분선은 항상
 * 보여준다(오른쪽이 비어 있어도).
 */
function A4Page({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="paper-page spread-page print:p-[15mm] mx-auto">
      <p className="no-print text-xs text-gray-400 mb-3 border-b border-dashed border-gray-300 pb-2">
        {label}
      </p>
      <div className="a4-columns grid grid-cols-2 h-full">
        <div className="pr-6 border-r border-gray-300 overflow-hidden">{children}</div>
        <div className="pl-6" />
      </div>
    </section>
  );
}

function QuestionBlock({ q }: { q: AssembledQuestion }) {
  const regions = q.regions?.filter((r) => r.imageUrl) ?? [];
  if (regions.length > 0) {
    const first = regions[0];
    const regionWidth = first.bbox.x1 - first.bbox.x0;
    const maskPercent = q.numberMaskWidth ? Math.min(40, (q.numberMaskWidth / regionWidth) * 100) : 0;
    return (
      <div className="question-block mb-6">
        {/* 번호는 첫 구간에만 붙는다 — 이후 구간은 컬럼/페이지 경계를 넘어간 연속분 */}
        <div className="relative">
          {maskPercent > 0 && (
            <div
              className="absolute top-0 left-0 bg-white flex items-start justify-start pl-0.5"
              style={{ width: `${maskPercent}%`, height: "1.5em" }}
            >
              <span className="font-semibold text-[15px]">{q.displayNo}.</span>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={first.imageUrl} alt={`문항 ${q.displayNo}`} className="w-full" />
        </div>
        {regions.slice(1).map((r, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={r.imageUrl} alt={`문항 ${q.displayNo} (계속)`} className="w-full mt-1" />
        ))}
      </div>
    );
  }

  // Text fallback — used until the original-image crop has been uploaded.
  return (
    <div className="question-block mb-6">
      <p className="font-semibold text-[15px] mb-2">
        {q.displayNo}. {q.stem}
      </p>
      <ol className="text-[14px] space-y-1">
        {q.choices.map((c) => (
          <li key={c.no} className="flex gap-1.5">
            <span>{CIRCLED[c.no - 1]}</span>
            <span>{c.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function PaperView({ paper }: { paper: AssembledPaper }) {
  return (
    <div id="paper-print">
      {paper.passages.map((passage, i) => {
        const passageRegions = passage.regions?.filter((r) => r.imageUrl) ?? [];
        return (
          <div key={passage.id}>
            {/* 홀수 페이지: 지문 (좌단), 우단은 항상 비워 둠 */}
            <A4Page label={`${i * 2 + 1}쪽 · 지문`}>
              {i === 0 && (
                <header className="text-center mb-8 border-b-4 border-black pb-4">
                  {paper.subtitle && (
                    <p className="text-sm tracking-widest text-gray-500">{paper.subtitle}</p>
                  )}
                  <h1 className="text-2xl font-bold mt-2">{paper.title}</h1>
                </header>
              )}
              {passage.source.label && (
                <p className="text-[11px] text-gray-400 mb-2">{passage.source.label}</p>
              )}
              {passageRegions.length > 0 ? (
                passageRegions.map((r, ri) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={ri}
                    src={r.imageUrl}
                    alt={passage.title ?? "지문"}
                    className={ri > 0 ? "w-full mt-1" : "w-full"}
                  />
                ))
              ) : passage.paragraphs.length > 0 ? (
                <div className="text-[14px] leading-8 border border-gray-300 rounded p-6 bg-gray-50">
                  {passage.paragraphs.map((p, pi) => (
                    <p key={pi} className="mb-3 last:mb-0 indent-2">
                      {p}
                    </p>
                  ))}
                </div>
              ) : null}
            </A4Page>

            {/* 짝수 페이지: 문제 (좌단), 우단은 항상 비워 둠 */}
            <A4Page label={`${i * 2 + 2}쪽 · 문제`}>
              {passage.questions.map((q) => (
                <QuestionBlock key={q.id} q={q} />
              ))}
            </A4Page>
          </div>
        );
      })}

      <section className="paper-page answer-page px-10 py-12 print:p-[15mm] max-w-[210mm] mx-auto">
        <h2 className="text-xl font-bold mb-6 text-center">정답표</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {chunk(paper.answerKey, 10).map((row, ri) => (
              <tr key={ri}>
                {row.map((a) => (
                  <td key={a.displayNo} className="border border-gray-300 p-2 text-center">
                    <div className="text-xs text-gray-400">{a.displayNo}</div>
                    <div className="font-semibold">{CIRCLED[a.answer - 1]}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
