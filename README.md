# 평가원 기출 문제지 생성기 (newkice)

평가원 기출 지문·문항을 골라 원본 그대로(이미지 크롭) 재구성한 문제지를
자동으로 만들어 주는 도구입니다. 텍스트 재구성이 아니라 원본 PDF 페이지에서
지문/문항 영역을 픽셀 단위로 잘라낸 이미지를 사용해, 표·그래프·밑줄 등
원본 서식을 그대로 보존합니다.

## 구조

- `lib/types.ts` — 지문(`Passage`)·문항(`Question`)·생성 결과(`AssembledPaper`) 데이터 모델. 각 지문/문항은 원본 PDF 크롭 영역(`region`)을 갖는다.
- `lib/parse/pdf-columns.ts` — PDF 페이지 텍스트를 좌표 기반으로 2단 컬럼 분리 + 읽기 순서로 재정렬 (줄마다 bounding box 포함)
- `lib/parse/segment.ts` — 좌표가 붙은 줄(`PositionedLine[]`)을 지문/문항 단위로 묶고, 각 단위의 크롭 영역(bbox)을 계산
- `lib/parse/pdf-images.ts` — `@napi-rs/canvas` + `pdfjs-dist`로 페이지를 래스터화하고 bbox로 크롭
- `scripts/ingest.ts` — 원본 PDF 하나를 받아 텍스트 파싱 + 이미지 크롭까지 수행, `data/bank.json`과 `samples/crops/`에 저장
- `scripts/upload-images.ts` — `samples/crops/`의 이미지를 Vercel Blob에 업로드하고 `region.imageUrl`을 채움
- `lib/layout/assemble.ts` — 선택한 문항들을 지문별로 묶고 번호를 순서대로 재배치
- `app/bank` — 지문/문항 검색·선택 UI
- `app/generate` — 선택 항목 순서 조정, 제목 입력, 미리보기, PDF 저장(인쇄)

## 문제지 레이아웃

홀수 쪽 = 지문 전체, 짝수 쪽 = 그 지문의 문항 전체. 각 쪽은 A4 크기로
고정되고, 좌/우 2단 구성을 항상 유지한다(오른쪽이 비어 있어도 구분선은
표시). 문항 번호는 원본 이미지의 번호를 흰 박스로 가리고 새로 배정된
번호를 그 위에 표시하는 방식으로 자동 재배치된다.

## 실제 기출 데이터 채우기

```bash
# 1. 원본 PDF를 텍스트 파싱 + 이미지 크롭까지 처리
npm run ingest -- <원본PDF경로> --subject 국어 --category 독서 --answers <정답표.txt>

# 2. 크롭된 이미지를 Vercel Blob에 업로드하고 imageUrl 채우기
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... npm run upload-images
```

- `--answers`를 생략하면 정답이 placeholder로 채워지고 경고가 출력됩니다. **반드시 정답표로
  검증한 뒤** 문제지 생성에 사용하세요.
- 크롭 이미지는 `samples/crops/`에 저장되며 저작권 있는 원본 크롭이라 git에는 커밋하지 않는다(`.gitignore` 처리). Blob 업로드 후에는 `region.imageUrl`만 `data/bank.json`에 남는다.
- `data/bank.json`이 비어 있으면 UI는 `data/sample-bank.json`(직접 작성한 예시 데이터,
  실제 기출 아님)을 대신 보여줍니다.
- 앱은 배포 시 `data/bank.json`을 직접 번들하지 않고 GitHub raw URL(`lib/data.ts`의 `BANK_DATA_URL`)에서 런타임에 fetch한다 — 데이터가 수 MB로 커도 서버리스 함수 크기에 영향 없음.

## 알려진 제약

- `lib/parse/segment.ts`의 정규식 기반 분리 로직은 일부 오래된 형식(2009학년도 이전 등)이나
  스캔 특성에 따라 텍스트 추출 자체가 안 되는 파일이 있을 수 있다. `ingest-debug.txt`(매칭
  실패 라인 목록)를 보고 튜닝이 필요할 수 있다.
- 지문/문항이 페이지 경계를 넘어가면 크롭 영역이 첫 페이지분만 반영된다(2페이지 이상 걸치는
  경우 후속 개선 필요).

## 개발

```bash
npm install
npm run dev
```
