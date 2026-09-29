import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { kstDateOf } from "@/lib/kst-date";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { getSimpleSettingValues } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  APPROVAL_ROUTE_LEAVE_STEP1_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP1_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP2_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP4_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP4_ORG_UNIT_ID,
} from "@/domain/settings/keys";
import { allocateDocumentNumber, loadDocumentNumberFormat } from "@/domain/document-numbering";
import {
  createVisibleMemo,
  prepareSubmission,
  registerDocumentKind,
  submitDocument,
  type RouteConfig,
  type RouteSettingDefs,
} from "@/domain/approvals";
import type { findVisibility } from "@/repositories/permissions";
import type { DescribeDeps, DocumentDetailRow, DocumentDetailRows, LoadDetailsDeps, RouteConfigStep } from "@/domain/approvals/kinds";
import type { TxLogDeps } from "@/domain/approvals/tx-log";
import {
  findLeaveRequestById,
  findLeaveRequestsByIds,
  insertLeaveRequest,
  listLeaveRequestsByDrafter,
  setLeaveNumber,
  type LeaveRequestWithApproval,
} from "@/repositories/leave-requests";
import { countLeaveQuarters, formatLeaveDays, type HalfPeriod, type LeaveFieldError, type LeaveKind } from "@/domain/leave/days";
import { LEAVE_REQUEST_DTO_SPEC, type LeaveRequestBalanceDto, type LeaveRequestDto } from "@/domain/leave/dto";
import { assertLeaveWrite, canSeeLeaveDocument, canWriteLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { getLeaveBalancesForRequests } from "@/domain/leave/balance-service";
import { formatBalanceRow, type BalanceLine, type RequestBalance } from "@/domain/leave/balance";

export { LEAVE_DOCUMENT_KIND, canSeeLeaveDocument } from "@/domain/leave/access";
export type { LeaveRequestDto } from "@/domain/leave/dto";

// 04.1(LEAV-01): 연차 — 결재 모듈에 문서 종류로 등록되고, 제출은 같은 결재
// 엔진(domain/approvals)을 지난다. 결재 모듈은 이 파일을 import하지 않는다.

export class LeaveValidationError extends UserFacingError {
  constructor(readonly fieldErrors: LeaveFieldError[]) {
    super(fieldErrors[0]?.message ?? "입력을 확인해 주세요");
  }
}

// 결재선 설정 17키의 정본 묶음 — 04.1-04 설정 화면 경고가 routeSettings로 순회한다.
export const LEAVE_ROUTE_SETTINGS: RouteSettingDefs = {
  selfApproval: APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  steps: [
    {
      enabled: APPROVAL_ROUTE_LEAVE_STEP1_ENABLED,
      roleId: APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
      scope: APPROVAL_ROUTE_LEAVE_STEP1_SCOPE,
      orgUnitId: APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_LEAVE_STEP2_ENABLED,
      roleId: APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
      scope: APPROVAL_ROUTE_LEAVE_STEP2_SCOPE,
      orgUnitId: APPROVAL_ROUTE_LEAVE_STEP2_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_LEAVE_STEP3_ENABLED,
      roleId: APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
      scope: APPROVAL_ROUTE_LEAVE_STEP3_SCOPE,
      orgUnitId: APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_LEAVE_STEP4_ENABLED,
      roleId: APPROVAL_ROUTE_LEAVE_STEP4_ROLE_ID,
      scope: APPROVAL_ROUTE_LEAVE_STEP4_SCOPE,
      orgUnitId: APPROVAL_ROUTE_LEAVE_STEP4_ORG_UNIT_ID,
    },
  ],
};

const LEAVE_ROUTE_DEFS = [
  APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  ...LEAVE_ROUTE_SETTINGS.steps.flatMap((step) => [step.enabled, step.roleId, step.scope, step.orgUnitId]),
];

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`결재선 설정 '${key}' 값 없음`);
  return value;
}

// 17키를 getSimpleSettingValues **한 번**(SELECT 한 문장)으로 읽어 객체 하나로
// 조립한다 — 키마다 따로 읽으면 그 사이의 관리자 저장이 섞인다(Codex HIGH 스냅숏).
// 기본값 없는 org_unit_id 키(지금은 3단)에 행이 없으면 ""(특정 부서 없음 — 그 단계는
// 빈 자리)로 읽는다 — 연차 신청·미리보기가 원시 오류로 막히지 않는다(CEO-7).
export async function loadLeaveRouteConfig(deps?: Parameters<typeof getSimpleSettingValues>[1]): Promise<RouteConfig> {
  const values = await getSimpleSettingValues(LEAVE_ROUTE_DEFS, deps);
  const byKey = new Map(LEAVE_ROUTE_DEFS.map((def, i) => [def.key, values[i]]));
  const read = <T>(def: { key: string }): T | undefined => byKey.get(def.key) as T | undefined;

  const steps: RouteConfigStep[] = LEAVE_ROUTE_SETTINGS.steps.map((step) => ({
    enabled: required(read<boolean>(step.enabled), step.enabled.key),
    roleId: required(read<string>(step.roleId), step.roleId.key),
    scope: required(read<RouteConfigStep["scope"]>(step.scope), step.scope.key),
    orgUnitId: read<string>(step.orgUnitId) ?? "",
  }));
  const selfApproval = required(read<RouteConfig["selfApproval"]>(APPROVAL_ROUTE_LEAVE_SELF_APPROVAL), APPROVAL_ROUTE_LEAVE_SELF_APPROVAL.key);
  return { selfApproval, steps };
}

function toSource(row: LeaveRequestWithApproval): LeaveRequestDto {
  return {
    id: row.id,
    number: row.number,
    drafterName: row.drafterName,
    kind: row.kind as LeaveKind,
    startDate: row.startDate,
    endDate: row.endDate,
    half: row.half as HalfPeriod | null,
    daysQuarters: row.daysQuarters,
    days: formatLeaveDays(row.daysQuarters),
    fiscalYear: row.fiscalYear,
    note: row.note,
    instanceId: row.instanceId,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
  };
}

async function describeLeaveDocuments(viewer: Viewer, ids: string[], deps?: DescribeDeps): Promise<Map<string, object>> {
  const rows = await findLeaveRequestsByIds(viewer, { ids, documentKind: LEAVE_DOCUMENT_KIND });
  const result = new Map<string, object>();
  for (const row of rows) {
    result.set(row.id, await project(viewer, toSource(row), LEAVE_REQUEST_DTO_SPEC, deps?.visible ? { visible: deps.visible } : undefined));
  }
  return result;
}

// 04.1-05(T18 · UI-SPEC 사용자 확인 대상 #5): 제목 자리의 종류 · 기간 — 구분자 ` — `는 이 함수 한 곳이다.
// 문서 화면 머리와 결재 시트 머리가 같이 쓴다(표 셀은 `·` — 표에서 `—`는 「비어 있음」이다).
const KIND_WORDS: Record<LeaveKind, string> = { full_day: "종일", half_day: "반차", quarter_day: "반반차", remote: "재택" };
const HALF_WORDS: Record<HalfPeriod, string> = { am: "오전", pm: "오후" };

type LeaveTitleSource = { kind?: LeaveKind; half?: HalfPeriod | null; startDate?: string; endDate?: string };

function kindWord(leave: LeaveTitleSource): string {
  if (!leave.kind) return "";
  return `${KIND_WORDS[leave.kind]}${leave.half ? ` ${HALF_WORDS[leave.half]}` : ""}`;
}

export function formatLeaveTitle(leave: LeaveTitleSource): string {
  if (!leave.kind || !leave.startDate) return "연차";
  const end = leave.endDate && leave.endDate !== leave.startDate ? ` ~ ${leave.endDate.slice(5)}` : "";
  return `연차 — ${kindWord(leave)} ${leave.startDate.slice(5)}${end}`;
}

// 04.1-05(ENG-17 · CEO-9): 결재 시트 상세 — loadDetails는 구조 필드만, 행 문자열은 투영 뒤 buildDetailRows가.
// 연차 필드는 leave.value(04.1-03 신청용 잔고 DTO와 같은 항목), 기안 이름 · 기안일은 approval.value
// (04.1-01 결재함 DTO와 같은 항목) — 새 정보 항목 없음. 잔고는 신청용 DTO(입사일 · 퇴직일 없음)만.
export type LeaveDetailDto = {
  number: string | null;
  kind: LeaveKind;
  half: HalfPeriod | null;
  startDate: string;
  endDate: string;
  days: string;
  note: string | null;
  balance: Partial<LeaveRequestBalanceDto> | null;
  drafterName: string;
  createdAt: Date;
};

export const LEAVE_DETAIL_DTO_SPEC: DtoSpec<LeaveDetailDto, LeaveDetailDto> = {
  fields: [
    { key: "number", from: "number", infoItem: "leave.value" },
    { key: "kind", from: "kind", infoItem: "leave.value" },
    { key: "half", from: "half", infoItem: "leave.value" },
    { key: "startDate", from: "startDate", infoItem: "leave.value" },
    { key: "endDate", from: "endDate", infoItem: "leave.value" },
    { key: "days", from: "days", infoItem: "leave.value" },
    { key: "note", from: "note", infoItem: "leave.value" },
    { key: "balance", from: "balance", infoItem: "leave.value" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "createdAt", from: "createdAt", infoItem: "approval.value" },
  ],
};

registerDto({
  name: "leaveDetail",
  fields: LEAVE_DETAIL_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

async function loadLeaveDetails(viewer: Viewer, ids: string[], deps: LoadDetailsDeps): Promise<Map<string, LeaveDetailDto>> {
  // 시계는 받은 now만 쓴다 — 없으면 보임 규칙 입구(access.ts)가 정한다(CX-B2, 이 층은 시계를 읽지 않는다).
  const seeDeps = deps.now ? { today: seoulToday(deps.now) } : undefined;
  const rows = await findLeaveRequestsByIds(viewer, { ids, documentKind: LEAVE_DOCUMENT_KIND });
  const visibleRows: LeaveRequestWithApproval[] = [];
  for (const row of rows) {
    if (await canSeeLeaveDocument(viewer, row, seeDeps)) visibleRows.push(row);
  }
  const counted = visibleRows.filter((row) => row.kind !== "remote");
  // 재택은 잔고 행이 없다 — 잔고 재료를 읽지 않는다.
  const balances = await getLeaveBalancesForRequests(
    viewer,
    counted.map((row) => row.id),
    { visible: deps.visible, now: deps.now, leaves: counted },
  );
  const result = new Map<string, LeaveDetailDto>();
  for (const row of visibleRows) {
    result.set(row.id, {
      number: row.number,
      kind: row.kind as LeaveKind,
      half: row.half as HalfPeriod | null,
      startDate: row.startDate,
      endDate: row.endDate,
      days: formatLeaveDays(row.daysQuarters),
      note: row.note,
      balance: balances.get(row.id) ?? null,
      drafterName: row.drafterName,
      createdAt: row.createdAt,
    });
  }
  return result;
}

const BALANCE_KEYS: readonly (keyof RequestBalance)[] = ["annualRemaining", "monthlyRemaining", "pending", "thisRequest", "plannedDeduction", "over"];

// 잔고 행 글자(04.1-03 formatBalanceRow 그대로) — 투영에서 칸이 하나라도 빠졌거나 재택이면 null(행 없음).
// 결재 시트(buildDetailRows)와 문서 화면이 같이 쓴다.
export function formatRequestBalanceRow(balance: Partial<LeaveRequestBalanceDto> | null | undefined, kind: LeaveKind): BalanceLine[] | null {
  if (!balance || !BALANCE_KEYS.every((key) => key in balance)) return null;
  return formatBalanceRow(balance as RequestBalance, kind);
}

// 투영된 필드만으로 행을 만든다 — 숨긴 정보 항목의 값은 여기 올 수 없다(ENG-17). `일수` 행은 잔고 행이
// 없을 때만(재택 — 잔고 행 1행의 `이번 신청`과 같은 숫자를 두 자리에 쓰지 않는다, T8).
function buildLeaveDetailRows(projected: Partial<LeaveDetailDto>): DocumentDetailRows {
  const balanceLines = projected.kind ? formatRequestBalanceRow(projected.balance, projected.kind) : null;
  const rows: DocumentDetailRow[] = [];
  if (projected.kind) rows.push({ label: "종류", value: kindWord(projected), tone: "default" });
  if (projected.startDate) {
    const end = projected.endDate && projected.endDate !== projected.startDate ? ` ~ ${projected.endDate}` : "";
    rows.push({ label: "기간", value: `${projected.startDate}${end}`, tone: "default" });
  }
  if (!balanceLines && projected.days !== undefined) rows.push({ label: "일수", value: projected.days, tone: "default" });
  if (projected.note !== undefined) rows.push({ label: "비고", value: projected.note || "—", tone: "default" });
  for (const line of balanceLines ?? []) rows.push({ label: "잔고", value: line.text, tone: line.tone });
  const drafted = [projected.drafterName, projected.createdAt ? kstDateOf(projected.createdAt) : null].filter(Boolean).join(" · ");
  if (drafted) rows.push({ label: "기안", value: drafted, tone: "default" });
  return {
    title: formatLeaveTitle(projected),
    subtitle: [projected.number, projected.drafterName].filter(Boolean).join(" · "),
    rows,
  };
}

registerDocumentKind({
  kind: LEAVE_DOCUMENT_KIND,
  label: "연차",
  loadRouteConfig: () => loadLeaveRouteConfig(),
  href: (documentId) => `/leave/${documentId}`,
  describeDocuments: describeLeaveDocuments,
  routeSettings: LEAVE_ROUTE_SETTINGS,
  canResubmit: canWriteLeave,
  loadDetails: loadLeaveDetails,
  detailDto: LEAVE_DETAIL_DTO_SPEC,
  buildDetailRows: buildLeaveDetailRows,
});

export type SubmitLeaveInput = { kind: string; startDate: string; endDate: string; half: string; note?: string | null };
export type SubmitLeaveDeps = { now?: Date } & TxLogDeps;

// 제출 — 검증(검증된 값만 저장) → 트랜잭션 전 읽기(결재선 · 스냅숏 · 로그 켜짐 ·
// 번호 서식) → 트랜잭션 안에서 tx 호출만: 신청 행 → 결재 인스턴스·차수·단계·로그 →
// 마지막 쓰기로 번호 할당과 기록(카운터 행 잠금을 가장 짧게 — CEO-2).
export async function submitLeave(
  viewer: Viewer,
  input: SubmitLeaveInput,
  deps?: SubmitLeaveDeps,
): Promise<{ leaveId: string; instanceId: string; number: string; version: number }> {
  await assertLeaveWrite(viewer);
  const days = countLeaveQuarters(input);
  if (!days.ok) throw new LeaveValidationError(days.errors);
  const year = Number(seoulToday(deps?.now).slice(0, 4));

  const prepared = await prepareSubmission(viewer, { kind: LEAVE_DOCUMENT_KIND, drafterId: viewer.id }, { now: deps?.now });
  const format = await loadDocumentNumberFormat(LEAVE_DOCUMENT_KIND);
  const note = input.note?.trim() ? input.note.trim() : null;

  return withTransaction(async (tx) => {
    const leave = await insertLeaveRequest(
      viewer,
      {
        drafterId: viewer.id,
        kind: days.kind,
        startDate: days.startDate,
        endDate: days.endDate,
        half: days.half,
        daysQuarters: days.quarters,
        fiscalYear: days.fiscalYear,
        note,
      },
      tx,
    );
    const instance = await submitDocument(viewer, prepared, { documentId: leave.id }, tx, { appendActionLog: deps?.appendActionLog });
    const { number } = await allocateDocumentNumber(viewer, { counterKey: LEAVE_DOCUMENT_KIND, year, format }, tx);
    await setLeaveNumber(viewer, leave.id, number, tx);
    return { leaveId: leave.id, instanceId: instance.id, number, version: instance.version };
  });
}

// 문서 하나 — 보이는 사람(canSeeLeaveDocument)이 아니면 null(→ 404).
export async function getLeave(
  viewer: Viewer,
  id: string,
  deps?: { now?: Date },
): Promise<Partial<LeaveRequestDto> | null> {
  const row = await findLeaveRequestById(viewer, { id, documentKind: LEAVE_DOCUMENT_KIND });
  if (!row) return null;
  if (!(await canSeeLeaveDocument(viewer, row, { today: seoulToday(deps?.now) }))) return null;
  return project(viewer, toSource(row), LEAVE_REQUEST_DTO_SPEC);
}

// 내 연차 목록 — 그 회계연도의 내 신청(시작일 오름차순).
export async function listMyLeave(
  viewer: Viewer,
  input: { fiscalYear: number },
  deps?: { now?: Date; findVisibility?: typeof findVisibility },
): Promise<Partial<LeaveRequestDto>[]> {
  const today = seoulToday(deps?.now);
  const visible = createVisibleMemo(deps?.findVisibility);
  const rows = await listLeaveRequestsByDrafter(viewer, {
    drafterId: viewer.id,
    fiscalYear: input.fiscalYear,
    documentKind: LEAVE_DOCUMENT_KIND,
  });
  const result: Partial<LeaveRequestDto>[] = [];
  for (const row of rows) {
    if (!(await canSeeLeaveDocument(viewer, row, { today }))) continue;
    result.push(await project(viewer, toSource(row), LEAVE_REQUEST_DTO_SPEC, { visible }));
  }
  return result;
}
