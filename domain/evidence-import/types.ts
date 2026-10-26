// 06.1-02: 증빙 가져오기 줄 · 서식 규칙 · 거절 모양. 아무 런타임 모듈도 import하지 않는다 — 06.1-10이 엑셀 파서 없이
// `EVIDENCE_FORMAT_TYPES`만 읽는다(C-F15).

// 서식 키 → 증빙 종류(코드표 값). 서식 규칙의 `evidenceType`은 이 표 값을 쓰고, 등록 배열과 1:1이다.
export const EVIDENCE_FORMAT_TYPES = [
  { key: "card-lotte", evidenceType: "card_receipt" },
  { key: "card-shinhan", evidenceType: "card_receipt" },
  { key: "card-shinhan-accounting", evidenceType: "card_receipt" },
  { key: "card-bc", evidenceType: "card_receipt" },
  { key: "hometax-tax-invoice", evidenceType: "tax_invoice" },
  { key: "hometax-invoice", evidenceType: "invoice" },
  { key: "hometax-cash-receipt", evidenceType: "cash_receipt" },
] as const;

export type EvidenceFormatKey = (typeof EVIDENCE_FORMAT_TYPES)[number]["key"];
export type Container = "cfb" | "xlsx" | "csv";
export type Rows = readonly (readonly unknown[])[];

// 파일 한 줄. 금액은 아직 미결정 — `vatKrw` · `supplyKrw`가 null이면 파일에 그 칸이 없다(역산은 finalizeAmounts).
// 카드 전체 번호 · 결제 계좌번호 칸은 두지 않는다(끝 4자리만).
export type ParsedLine = {
  /** 엑셀 줄 번호(1부터). */
  lineNo: number;
  evidenceType: string;
  approvalNo: string | null;
  /** 한국 날짜 `YYYY-MM-DD` 글자 그대로. */
  issuedOn: string;
  /** `HH:MM:SS` — 파일에 시각이 없으면 null. */
  usedAt: string | null;
  totalKrw: number;
  vatKrw: number | null;
  supplyKrw: number | null;
  merchant: string | null;
  businessNoDigits: string | null;
  nameOnDocument: string | null;
  cardLast4: string | null;
  needsCheck: string | null;
  originalApprovalNo: string | null;
};

// 열쇠가 붙은 금액 미결정 줄. `#n`은 한 파일 안에서만 줄을 가르는 꼬리표라 `baseKey` · `sameKeyCount`를 함께 싣는다(GH-P1).
export type KeyedLine = ParsedLine & { dedupeKey: string; baseKey: string; sameKeyCount: number };

// 금액이 정해진 등록용 줄.
export type FinalLine = Omit<KeyedLine, "vatKrw" | "supplyKrw"> & { vatKrw: number; supplyKrw: number };

export type SheetPreview = { name: string; rows: Rows };
export type DetectResult = { match: true; sheetIndex: number; headerRow: number } | { match: false; salesList?: boolean };
export type ReadContext = { headerRow: number; date1904: boolean };
export type LineError = { lineNo: number; reason: string };
export type FormatReadResult = { lines: ParsedLine[]; errors: LineError[]; checksum: { label: string; file: number; sum: number } | null };

export type FormatRule = {
  key: EvidenceFormatKey;
  label: string;
  containers: readonly Container[];
  evidenceType: string;
  createsVendor: boolean;
  issuerAliases: readonly string[];
  /** card = 카드 열쇠(끝4 · 승인번호 · 날짜 · 합계)와 같은 파일 안 `#n`, approval = 승인번호 하나(겹침은 줄 오류),
   *  approval-dated = 승인번호 · 날짜 · 사업자번호 · 부호 있는 합계(현금영수증 — 겹침은 줄 오류). */
  keyKind: "card" | "approval" | "approval-dated";
  detect(sheets: readonly SheetPreview[], container: Container): DetectResult;
  read(rows: Rows, ctx: ReadContext): FormatReadResult;
};

export type RefusalKind = "size" | "not-excel" | "encrypted" | "unknown-format" | "sales-list" | "line-errors" | "checksum" | "rows";
export type Refusal = { ok: false; kind: RefusalKind; headline: string; lines: string[]; restCount: number };
// `offsetLines`: 파일 안에서 뺀 상쇄 쌍의 두 줄(등록 줄과 같은 모양 · 열쇠 포함). 한쪽만 앞 파일로 이미 등록돼 있으면
// 06.1-04가 다른 쪽을 등록한다(사용자 카드 2026-10-16 18:12Z 「앞 파일 대조」 · 양쪽 대칭). 역산이 필요하면 그 날짜도 rateDates에 있다.
export type OffsetLinePair = { original: KeyedLine; cancel: KeyedLine };
export type ParseSuccess = { ok: true; format: EvidenceFormatKey; lines: KeyedLine[]; rateDates: string[]; offsetPairs: number; offsetLines: OffsetLinePair[] };
