# 평가원 기출 문제지 생성기 (newkice)

평가원 기출 지문·문항을 골라 평가원 스타일(2단 편집, 자동 번호 배치, 정답표 포함)의
문제지를 자동으로 만들어 주는 도구입니다.

## 구조

- `lib/types.ts` — 지문(`Passage`)·문항(`Question`)·생성 결과(`AssembledPaper`) 데이터 모델
- `lib/parse/` — PDF → 텍스트 추출(`text.ts`, `pdf-columns.ts`) 및 지문/문항 분리(`segment.ts`)
- `scripts/ingest.ts` — 원본 PDF를 받아 `data/bank.json`에 구조화된 데이터로 적재하는 CLI
- `lib/layout/assemble.ts` — 선택한 문항들을 순서대로 묶고 번호를 재배치하는 생성 엔진
- `app/bank` — 지문/문항 검색·선택 UI
- `app/generate` — 선택 항목 순서 조정, 제목 입력, 미리보기, PDF 저장(인쇄)

## 실제 기출 데이터 채우기

```bash
npm run ingest -- <원본PDF경로> --subject 국어 --category 독서 --answers <정답표.txt>
```

- `--answers`를 생략하면 정답이 placeholder로 채워지고 경고가 출력됩니다. **반드시 정답표로
  검증한 뒤** 문제지 생성에 사용하세요.
- 컬럼(좌/우 단) 인식이 잘못될 경우 `--naive` 플래그로 pdf-parse의 단순 선형 추출로
  대체할 수 있습니다.
- `data/bank.json`이 비어 있으면 UI는 `data/sample-bank.json`(직접 작성한 예시 데이터,
  실제 기출 아님)을 대신 보여줍니다.

## 알려진 제약

- `lib/parse/segment.ts`의 정규식 기반 분리 로직은 실제 평가원 기출 PDF로 검증되지
  않았습니다. 원본 PDF를 인제스트한 뒤 `ingest-debug.txt`(매칭 실패 라인 목록)를 보고
  튜닝이 필요할 수 있습니다.
- 표·그래프가 포함된 지문(과학탐구 등)은 텍스트 추출만으로는 원본 그대로 재현되지 않습니다.

## 개발

```bash
npm install
npm run dev
```
