import { recordAction } from "@/domain/action-log/record";
import { can } from "@/domain/permissions/can";
import type { Viewer } from "@/domain/viewer";
import { registerExport } from "@/lib/actions/registry";
import { csvEscape } from "@/lib/csv";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { listCodeItems } from "@/domain/code-tables";
import { readCustomFieldInputs } from "@/domain/custom-fields/access";
import { countVendors, ForbiddenError, listVendors, type VendorDto, type VendorListFilter } from "@/domain/vendors";
import { accountNumberLast4 } from "@/domain/vendors/account-digits";
import { VENDOR_KIND_LABELS } from "@/domain/vendors/kind";

// 07-20 V1 · K12 · D-736 — 거래처 목록 `파일 받기`. 화면이 가진 줄이 아니라 서버가 목록과 같은 거르개(숨김 · 갈래 · 검색어)와
// 같은 투영(VendorDto — 볼 수 없는 칸은 빈 칸)으로 다시 읽는다. 계좌번호는 해제 권한이 있어도 뒤 4자리뿐(대량 유출 경로 차단).
// 260907은 화면이 가진 그 쪽 줄만 계좌 전체와 함께 브라우저에서 만들었다(app/src/pages/Vendors.tsx:842-861 · ui/csv.ts:40-50,
// 수식 방어 없음) — 우리는 서버 · 전체 결과 · 뒤 4자리 · csvEscape · excel_export 기록 · 상한 5,000으로 다르게 간다.

export type VendorExportFile = { filename: string; contentType: string; body: string };
// 07.5-01: `custom` = 목록과 같은 선택 칸 거르개(정의 키 → 값).
export type VendorExportFilter = { includeHidden: boolean; kind: VendorListFilter["kind"]; q: string; custom?: Record<string, string> };

// D-7511: 9칸 뒤에 싣는 추가 칸(보이는 활성 칸 전부 · 상한 없음) — 값은 이미 칸별로 거른 DTO에서만 읽는다.
export type VendorCsvCustomColumn = { key: string; label: string; type: "text" | "number" | "date" | "select" };

// D-736: 넘으면 화면이 `파일 받기`를 막는다 — 서버도 같은 수로 거부한다.
export const VENDOR_EXPORT_LIMIT = 5000;
export class VendorExportTooManyError extends UserFacingError {
  constructor() {
    super("5,000곳 넘음 · 갈래나 검색으로 줄이기");
  }
}

const CSV_HEADERS = ["이름", "갈래", "사업자 번호", "지급 기한", "계좌 은행", "예금주", "계좌번호", "기본 증빙 종류", "숨김"] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return csvEscape(String(value));
}

function maskedAccount(last4: string | null | undefined): string {
  const tail = accountNumberLast4(last4);
  return tail === null ? "" : `····${tail}`;
}

// 추가 칸 한 칸의 CSV 글자 — 텍스트 · 선택 = csvEscape, 숫자 = 저장값이 숫자면 쉼표 · 반올림 없이 그대로(숫자가 아닌 옛 값은 csvEscape), 날짜 = 앞 10자, 없음 = 빈 칸.
function customCsvCell(column: VendorCsvCustomColumn, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (column.type === "number" && typeof value === "number") return String(value);
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  return column.type === "date" ? text.slice(0, 10) : csvEscape(text);
}

export function serializeVendorsAsCsv(
  rows: readonly VendorDto[],
  evidenceLabels: ReadonlyMap<string, string>,
  customColumns: readonly VendorCsvCustomColumn[] = [],
): VendorExportFile {
  const lines = [[...CSV_HEADERS.map(csvCell), ...customColumns.map((column) => csvEscape(column.label))].join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.kind === undefined ? undefined : VENDOR_KIND_LABELS[row.kind],
        row.businessNo,
        row.paymentTermDays,
        row.accountBank,
        row.accountHolder,
        maskedAccount(row.accountNumberLast4),
        row.defaultEvidenceType ? (evidenceLabels.get(row.defaultEvidenceType) ?? row.defaultEvidenceType) : null,
        row.hidden ? "숨김" : null,
      ]
        .map(csvCell)
        .concat(customColumns.map((column) => customCsvCell(column, row.customFields?.[column.key])))
        .join(","),
    );
  }
  // BOM — Excel이 UTF-8로 읽어 한글이 깨지지 않는다(증빙 · 행동 로그 내보내기와 같은 꼴).
  return { filename: `vendors-${Date.now()}.csv`, contentType: "text/csv; charset=utf-8", body: `﻿${lines.join("\r\n")}\r\n` };
}

export type VendorExportDeps = {
  countVendors: (viewer: Viewer, filter: VendorExportFilter) => Promise<number>;
  listVendors: (viewer: Viewer, filter: VendorExportFilter) => Promise<VendorDto[]>;
};

export async function exportVendorsCsv(viewer: Viewer, filter: VendorExportFilter, deps?: Partial<VendorExportDeps>): Promise<VendorExportFile> {
  if (!(await can(viewer, "admin.vendors", "view"))) throw new ForbiddenError("거래처 보기 권한 없음");
  // 수를 먼저 센다(D-736) — 넘으면 행을 읽지도 기록하지도 않는다.
  if ((await (deps?.countVendors ?? countVendors)(viewer, filter)) > VENDOR_EXPORT_LIMIT) throw new VendorExportTooManyError();
  const [rows, evidenceTypes, { inputDefs }] = await Promise.all([
    (deps?.listVendors ?? listVendors)(viewer, filter),
    listCodeItems(viewer, "evidence_type", { includeInactive: true }),
    readCustomFieldInputs(viewer, { entity: "vendor", valueInfoItem: "vendor.value" }),
  ]);
  // 세기와 읽기는 한 스냅숏이 아니다 — 사이에 늘어난 행도 상한으로 다시 막는다(Codex #285).
  if (rows.length > VENDOR_EXPORT_LIMIT) throw new VendorExportTooManyError();
  // 끌 수 없는 기록(excel_export)을 직렬화 전에 — 기록이 실패하면 파일이 없다. detail에는 거르개 · 건수만(계좌 · 사업자 번호 없음).
  await recordAction(viewer, {
    actionType: "excel_export",
    entity: "vendor",
    // 07.5-01: 추가 칸 거르개(정의 키 · 고른 선택지 — 정의 메타라 행 값이 아니다)만 더한다. 행의 추가 칸 값은 싣지 않는다.
    detail: {
      filter: {
        q: filter.q,
        includeHidden: filter.includeHidden,
        kind: filter.kind,
        ...(filter.custom && Object.keys(filter.custom).length > 0 ? { custom: filter.custom } : {}),
      },
      count: rows.length,
    },
  });
  return serializeVendorsAsCsv(
    rows,
    new Map(evidenceTypes.map((item) => [item.value, item.label])),
    inputDefs.map((def) => ({ key: def.key, label: def.label, type: def.type })),
  );
}

registerExport({ name: "vendors.export", menu: "admin.vendors", dtoName: "VendorDto" });
