// 06.1-02(E2): 증빙 가져오기 크기 · 행 상한과 그 거절 문구. 아무것도 import하지 않는다 — 06.1-05 브라우저 사전 검사가
// SheetJS 없이 이 모듈만 읽는다(registry.ts를 클라이언트가 import하면 SheetJS가 번들에 딸려 온다).

// 서버 액션 본문 기본 1MB 안에 multipart 머리가 들어가게 10진 1MB(PA-ROWS). 견본 6개월 홈택스 417KB.
export const EVIDENCE_IMPORT_MAX_BYTES = 1_000_000;
// 데이터 줄(머리줄 제외) 상한. 견본 6개월 홈택스 475줄.
export const EVIDENCE_IMPORT_MAX_ROWS = 3000;
// xlsx 압축 폭탄 막이(P2-A4) — SheetJS가 읽기 전에 zip 중앙 디렉터리로 잰다. 실측 xlsx는 항목 20개 안팎 · 풀린 크기 수 MB.
export const EVIDENCE_IMPORT_MAX_ZIP_ENTRIES = 200;
export const EVIDENCE_IMPORT_MAX_UNZIPPED_BYTES = 20_000_000;

const SPLIT_AND_RETRY = "기간을 나눠 다시 내려받기";

export function sizeRefusalHeadline(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)}MB · ${EVIDENCE_IMPORT_MAX_BYTES / 1_000_000}MB 초과 · ${SPLIT_AND_RETRY}`;
}

export function rowRefusalHeadline(rows: number): string {
  return `${rows.toLocaleString("en-US")}줄 · ${EVIDENCE_IMPORT_MAX_ROWS.toLocaleString("en-US")}줄 초과 · ${SPLIT_AND_RETRY}`;
}
