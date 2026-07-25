import type { AssembledPaper } from "@/lib/types";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PaperView({ paper }: { paper: AssembledPaper }) {
  return (
    <div id="paper-print">
      <section className="paper-page px-10 py-12 print:p-[15mm] max-w-[210mm] mx-auto">
        <header className="text-center mb-8 border-b-4 border-black pb-4">
          {paper.subtitle && (
            <p className="text-sm tracking-widest text-gray-500">{paper.subtitle}</p>
          )}
          <h1 className="text-2xl font-bold mt-2">{paper.title}</h1>
        </header>

        <div className="paper-columns">
          {paper.passages.map((passage) => (
            <div key={passage.id} className="passage-block mb-8">
              {passage.source.label && (
                <p className="text-[11px] text-gray-400 mb-1">{passage.source.label}</p>
              )}
              {passage.paragraphs.length > 0 && (
                <div className="text-[13px] leading-7 mb-4 border border-gray-300 rounded p-4 bg-gray-50">
                  {passage.paragraphs.map((p, i) => (
                    <p key={i} className="mb-3 last:mb-0 indent-2">
                      {p}
                    </p>
                  ))}
                </div>
              )}

              {passage.questions.map((q) => (
                <div key={q.id} className="question-block mb-5">
                  <p className="font-semibold text-[14px] mb-2">
                    {q.displayNo}. {q.stem}
                  </p>
                  <ol className="text-[13px] space-y-1">
                    {q.choices.map((c) => (
                      <li key={c.no} className="flex gap-1.5">
                        <span>{CIRCLED[c.no - 1]}</span>
                        <span>{c.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

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
