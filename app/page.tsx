import Link from "next/link";
import { getBank, isSampleBank } from "@/lib/data";

export default async function HomePage() {
  const bank = await getBank();
  const sample = isSampleBank(bank);

  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <h1 className="text-3xl font-bold mb-3">평가원 기출 문제지 생성기</h1>
      <p className="text-gray-600 mb-8">
        원하는 지문·문항을 골라 생성하기를 누르면, 평가원 스타일로 번호를 자동 배치해
        문제지 PDF를 만들어 드립니다.
      </p>

      {sample && (
        <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm px-4 py-3 text-left">
          <strong>지금은 샘플 데이터로 동작 중입니다.</strong> 실제 평가원 기출 지문은 아직
          인제스트되지 않았습니다. <code>npm run ingest</code>로 원본 PDF를 등록하면 실제
          기출로 채워집니다.
        </div>
      )}

      <div className="flex items-center justify-center gap-4 text-sm text-gray-500 mb-10">
        <span>지문 {bank.passages.length}개</span>
        <span>·</span>
        <span>문항 {bank.questions.length}개</span>
      </div>

      <Link
        href="/bank"
        className="inline-flex items-center px-6 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors"
      >
        문제은행 둘러보기
      </Link>
    </div>
  );
}
