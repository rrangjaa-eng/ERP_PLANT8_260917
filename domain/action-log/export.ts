import type { Viewer } from "@/domain/viewer";
import { queryActionLog as defaultQueryActionLog, type ActionLogFilter } from "@/domain/action-log";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerExport } from "@/lib/actions/registry";

// ADMN-10·OPS-05·Task 1 결정(옵션 A): 필터 결과를 Excel에서 열리는 파일로
// 직렬화한다 — UTF-8 BOM CSV, 신규 의존성 0. 반환 형태
// { filename, contentType, body } 세 조각이 체크포인트가 확정한 계약이다.
export type ActionLogExportRow = {
  occurredAt: Date;
  actorName: string | null;
  actorRoleName: string | null;
  actionTypeLabel: string;
  entity: string | null;
  entityId: string | null;
  documentId: string | null;
  detail: Record<string, unknown>;
};

export type ExportFile = { filename: string; contentType: string; body: string };

const CSV_HEADERS = ["발생 시각", "행위자", "행위자 계급", "행동 종류", "대상", "문서", "상세"] as const;

// 표준 CSV 이스케이프 — 구분자·줄바꿈·따옴표가 있으면 따옴표로 감싸고 내부
// 따옴표는 둘로 늘린다(RFC4180과 같은 결).
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// §2-4 날짜·시각 형식(ISO 날짜 + 24시간 시각) — 표 안 값이라 초까지 담아
// 정밀하게 구분한다.
function formatOccurredAt(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function toTarget(entity: string | null, entityId: string | null): string {
  if (!entity) return entityId ?? "";
  return entityId ? `${entity} ${entityId}` : entity;
}

function toDetailCell(detail: Record<string, unknown>): string {
  return Object.keys(detail).length > 0 ? JSON.stringify(detail) : "";
}

// 순수 함수 — Task 1 결정(A)의 핵심 요구사항: 행·열 구조(ActionLogExportRow[])와
// 직렬화를 분리한다. Phase 9에서 서식이 필요해지면 이 함수 하나만 .xlsx
// 직렬화로 바꾸면 exportActionLog의 반환 형태·호출자는 그대로다.
export function serializeActionLogExportAsCsv(rows: ActionLogExportRow[]): ExportFile {
  const lines = [CSV_HEADERS.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(
      [
        formatOccurredAt(row.occurredAt),
        row.actorName ?? "",
        row.actorRoleName ?? "",
        row.actionTypeLabel,
        toTarget(row.entity, row.entityId),
        row.documentId ?? "",
        toDetailCell(row.detail),
      ]
        .map((value) => csvEscape(value))
        .join(","),
    );
  }
  // BOM — Excel이 UTF-8로 인식해 한글이 깨지지 않고 더블클릭으로 바로 열린다.
  const body = `﻿${lines.join("\r\n")}\r\n`;
  return {
    filename: `action-log-${Date.now()}.csv`,
    contentType: "text/csv; charset=utf-8",
    body,
  };
}

export type ExportActionLogDeps = {
  queryActionLog: typeof defaultQueryActionLog;
  recordAction: typeof defaultRecordAction;
};

// 조회를 정확히 한 번 부르고 그 결과만 직렬화한다 — 내보내는 동안 새 로그가
// 쌓여도 한 번의 내보내기는 고정된 스냅샷을 쓴다(중간에 다시 조회하지
// 않는다). 직렬화 전에 recordAction으로 내보내기를 기록한다(excel_export는
// ALWAYS_ON — 설정과 무관하게 남는다). 실패는 예외로 전파되어 액션 계층이
// 부분 파일을 내려주지 않는다(직렬화가 끝난 뒤에만 반환값이 생긴다).
export async function exportActionLog(
  viewer: Viewer,
  filter: ActionLogFilter,
  deps?: Partial<ExportActionLogDeps>,
): Promise<ExportFile> {
  const queryActionLog = deps?.queryActionLog ?? defaultQueryActionLog;
  const rows = await queryActionLog(viewer, filter);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "excel_export",
    entity: "action_log",
    detail: {
      filter: {
        actorId: filter.actorId ?? null,
        actionType: filter.actionType ?? null,
        documentId: filter.documentId ?? null,
        from: filter.from ? filter.from.toISOString() : null,
        to: filter.to ? filter.to.toISOString() : null,
        includePruned: Boolean(filter.includePruned),
      },
      count: rows.length,
    },
  });

  const exportRows: ActionLogExportRow[] = rows.map((row) => ({
    occurredAt: row.occurredAt,
    actorName: row.actorName,
    actorRoleName: row.actorRoleName,
    actionTypeLabel: row.actionTypeLabel,
    entity: row.entity,
    entityId: row.entityId,
    documentId: row.documentId,
    detail: row.detail,
  }));

  return serializeActionLogExportAsCsv(exportRows);
}

// 03-04의 설정 내보내기(dtoName: null) 다음 두 번째 항목이자 Dto를 가진
// 첫 항목 — 누수 스캔의 내보내기 축이 처음으로 필드 매핑 케이스를 갖는다.
registerExport({ name: "action-log.export", menu: "admin.action-log", dtoName: "ActionLogDto" });
