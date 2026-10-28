import { recordAction } from "@/domain/action-log/record";
import { can, ForbiddenError } from "@/domain/permissions/can";
import type { Viewer } from "@/domain/viewer";
import { registerExport } from "@/lib/actions/registry";
import { csvEscape } from "@/lib/csv";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { countEvidenceRecords, INTAKE_FORBIDDEN, listAllEvidenceRecords, type EvidenceListQuery, type EvidenceRecordView } from "@/domain/evidence-records";

// 06.1-13 G6(RP-16 · 260907 Receipts 목록 내려받기) — 증빙 목록 `파일 받기`. 화면이 가진 줄이 아니라 서버가 목록과 같은 범위 · 거르개 ·
// 투영으로 필터 결과 전체를 다시 읽는다(볼 수 없는 칸은 빈 칸). 기록 → 직렬화 차례는 행동 로그 내보내기와 같다 — 기록이 실패하면 파일이 없다.
// 권한은 목록을 여는 문과 같다(PA-G6-PERM — `evidence.intake` 쓰기).

export type EvidenceExportFile = { filename: string; contentType: string; body: string };

// 목록 열 순서(06.1-05 표 + 07.1-01 며칠째 — 날짜 · 며칠째 · 거래처·가맹점 · 공급가 · 세액 · 합계 · 공개 · 상태).
// 며칠째는 화면 Ctrl+C 와 같은 값이다 — 안 붙은 줄은 등록일 기준 정수 일수, 붙음 · 보관 줄은 빈 칸(DTO가 null).
const CSV_HEADERS = ["날짜", "며칠째", "거래처·가맹점", "공급가", "세액", "합계", "공개", "상태"] as const;

// 칸 하나. Round 2 G7 — 서버가 만든 정수 칸(금액 셋)은 숫자 그대로 둔다: csvEscape를 거치면 음수가 `'-12000` 글자가 되어 Excel 합계가
// 목록 합계와 달라진다. 그 밖의 칸(거래처 · 팀 이름처럼 사람이 정한 글자)은 늘 csvEscape(수식 방어 · /cso F3).
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return csvEscape(String(value));
}

// 공개 칸 글자는 화면의 저장된 값 꼴과 같다 — 공개할 수 없는 줄(붙음 · 음수 · 경영관리만 종류 · 보관)은 `—`.
function visibilityTextOf(row: EvidenceRecordView): string | undefined {
  return row.visibilityCell === "readonly" ? "—" : row.visibilityLabel;
}

export function serializeEvidenceRecordsAsCsv(rows: readonly EvidenceRecordView[]): EvidenceExportFile {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([row.issuedOn, row.ageDays, row.counterparty, row.supplyKrw, row.vatKrw, row.totalKrw, visibilityTextOf(row), row.statusWord].map(csvCell).join(","));
  }
  // BOM — Excel이 UTF-8로 읽어 한글이 깨지지 않는다(행동 로그 내보내기와 같은 꼴).
  return { filename: `evidence-records-${Date.now()}.csv`, contentType: "text/csv; charset=utf-8", body: `﻿${lines.join("\r\n")}\r\n` };
}

// 07.1-05 D-7113: 넘으면 화면이 `파일 받기`를 막는다 — 서버도 같은 수로 거부한다(거래처 목록 VENDOR_EXPORT_LIMIT 꼴).
export const EVIDENCE_EXPORT_LIMIT = 5000;
export class EvidenceExportTooManyError extends UserFacingError {
  constructor() {
    super("5,000건 넘음 · 필터나 검색으로 줄이기");
  }
}

export type EvidenceExportDeps = {
  countEvidenceRecords: typeof countEvidenceRecords;
  listAllEvidenceRecords: typeof listAllEvidenceRecords;
};

export async function exportEvidenceRecords(viewer: Viewer, query: EvidenceListQuery, deps?: Partial<EvidenceExportDeps>): Promise<EvidenceExportFile> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  // 수를 먼저 센다(E-P2-19) — 넘으면 행을 읽지도 기록하지도 않는다.
  if ((await (deps?.countEvidenceRecords ?? countEvidenceRecords)(viewer, query)) > EVIDENCE_EXPORT_LIMIT) throw new EvidenceExportTooManyError();
  const { filters, rows } = await (deps?.listAllEvidenceRecords ?? listAllEvidenceRecords)(viewer, query);
  // 세기와 읽기는 한 스냅숏이 아니다 — 사이에 늘어난 행도 상한으로 다시 막는다.
  if (rows.length > EVIDENCE_EXPORT_LIMIT) throw new EvidenceExportTooManyError();
  // 끌 수 없는 기록(excel_export — ALWAYS_ON)을 직렬화 전에. detail에는 거르개 · 건수만(파일 이름 · 금액 · 카드 번호 · 사람 이름 없음 — T-061-133).
  await recordAction(viewer, { actionType: "excel_export", entity: "evidence_record", detail: { filter: { state: filters.state, type: filters.type, period: filters.period, batch: filters.batch }, count: rows.length } });
  return serializeEvidenceRecordsAsCsv(rows);
}

registerExport({ name: "evidence-records.export", menu: "evidence.intake", dtoName: "EvidenceRecordDto" });
