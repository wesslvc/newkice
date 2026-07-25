"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useSelection } from "@/lib/selection";
import type { Passage, Question, QuestionBank } from "@/lib/types";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export default function BankBrowser({ bank }: { bank: QuestionBank }) {
  const { ids, isSelected, toggle, selectMany, deselectMany } = useSelection();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("전체");
  const [subject, setSubject] = useState<string>("전체");

  const questionsByPassage = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of bank.questions) {
      const key = q.passageId ?? `standalone:${q.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    for (const list of map.values()) list.sort((a, b) => a.originalNo - b.originalNo);
    return map;
  }, [bank.questions]);

  const subjects = useMemo(
    () => ["전체", ...Array.from(new Set(bank.passages.map((p) => p.source.subject)))],
    [bank.passages]
  );
  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(bank.passages.map((p) => p.source.category)))],
    [bank.passages]
  );

  const filteredPassages = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bank.passages.filter((p: Passage) => {
      if (subject !== "전체" && p.source.subject !== subject) return false;
      if (category !== "전체" && p.source.category !== category) return false;
      if (!q) return true;
      const haystack = [p.title ?? "", p.source.label, ...p.paragraphs].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [bank.passages, query, subject, category]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="지문 제목·본문 검색"
          className="flex-1 min-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {ids.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-brand-50 border border-brand-100 px-4 py-2 text-sm">
          <span>
            <strong>{ids.length}개</strong> 문항 선택됨
          </span>
          <Link href="/generate" className="text-brand-700 font-semibold hover:underline">
            문제지 생성하러 가기 →
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {filteredPassages.length === 0 && (
          <p className="text-gray-400 text-sm py-8 text-center">검색 결과가 없습니다.</p>
        )}
        {filteredPassages.map((passage) => {
          const questions = questionsByPassage.get(passage.id) ?? [];
          const allIds = questions.map((q) => q.id);
          const allSelected = allIds.length > 0 && allIds.every((id) => isSelected(id));

          return (
            <div key={passage.id} className="border border-gray-200 rounded-lg bg-white p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p className="text-xs text-gray-400">
                    {passage.source.label || `${passage.source.subject} · ${passage.source.category}`}
                  </p>
                  <h3 className="font-semibold">{passage.title ?? "(제목 없음)"}</h3>
                </div>
                <button
                  onClick={() =>
                    allSelected ? deselectMany(allIds) : selectMany(allIds)
                  }
                  className={clsx(
                    "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md border",
                    allSelected
                      ? "bg-brand-600 text-white border-brand-600"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {allSelected ? "지문 전체 해제" : "지문 전체 선택"}
                </button>
              </div>

              <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                {passage.paragraphs.join(" ")}
              </p>

              <div className="space-y-2">
                {questions.map((question) => (
                  <label
                    key={question.id}
                    className={clsx(
                      "flex items-start gap-2 rounded-md p-2 text-sm cursor-pointer border",
                      isSelected(question.id)
                        ? "border-brand-300 bg-brand-50"
                        : "border-transparent hover:bg-gray-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(question.id)}
                      onChange={() => toggle(question.id)}
                      className="mt-1"
                    />
                    <span>
                      <strong>{question.originalNo}.</strong> {question.stem}
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {question.choices.map((c) => CIRCLED[c.no - 1]).join(" ")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
