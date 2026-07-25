"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSelection } from "@/lib/selection";
import { assemble } from "@/lib/layout/assemble";
import PaperView from "@/components/PaperView";
import type { QuestionBank } from "@/lib/types";

export default function GeneratePage() {
  const { ids, remove, move, clear } = useSelection();
  const [bank, setBank] = useState<QuestionBank | null>(null);

  useEffect(() => {
    fetch("/api/bank")
      .then((res) => res.json())
      .then(setBank)
      .catch(() => setBank({ generatedAt: "", passages: [], questions: [] }));
  }, []);

  const questionMap = useMemo(
    () => new Map((bank?.questions ?? []).map((q) => [q.id, q])),
    [bank]
  );

  const [title, setTitle] = useState("독서 고난도 모음");
  const [subtitle, setSubtitle] = useState("평가원 기출 재구성");
  const [showPreview, setShowPreview] = useState(false);

  const paper = useMemo(
    () =>
      bank
        ? assemble(bank, {
            title,
            subtitle,
            items: ids.map((questionId) => ({ questionId })),
          })
        : null,
    [bank, ids, title, subtitle]
  );

  if (!bank) {
    return <div className="text-center py-16 text-gray-400">불러오는 중…</div>;
  }

  if (ids.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="mb-4">아직 선택된 문항이 없습니다.</p>
        <Link href="/bank" className="text-brand-700 font-semibold hover:underline">
          문제은행에서 지문·문항 고르러 가기 →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="no-print grid md:grid-cols-[minmax(0,1fr)_320px] gap-6 mb-8">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">부제</label>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowPreview(true)}
              className="px-4 py-2 rounded-md bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
            >
              생성하기
            </button>
            {showPreview && (
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm font-semibold hover:bg-gray-50"
              >
                PDF로 저장 (인쇄)
              </button>
            )}
            <button
              onClick={clear}
              className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-500 hover:bg-gray-50"
            >
              선택 초기화
            </button>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg bg-white p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            선택된 문항 ({ids.length}) — 순서를 조정할 수 있습니다
          </p>
          <ol className="space-y-1 max-h-80 overflow-y-auto">
            {ids.map((id, idx) => {
              const q = questionMap.get(id);
              if (!q) return null;
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded px-2 py-1.5"
                >
                  <span className="truncate">
                    {idx + 1}. {q.stem}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => move(id, -1)} className="px-1 text-gray-400 hover:text-gray-700">
                      ↑
                    </button>
                    <button onClick={() => move(id, 1)} className="px-1 text-gray-400 hover:text-gray-700">
                      ↓
                    </button>
                    <button onClick={() => remove(id)} className="px-1 text-red-400 hover:text-red-600">
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {showPreview && paper && <PaperView paper={paper} />}
    </div>
  );
}
