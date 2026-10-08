import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectRowScope } from "@/domain/projects/visibility";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { moneyToColumns, MoneyInputError } from "@/domain/money";
import { computeVat, ForbiddenError, ProjectNotFoundError, type MoneyInputDto, type RevenueDeps } from "@/domain/revenue";
import { CompletedProjectError } from "@/domain/projects";
import { PROJECT_STATUS_WORD } from "@/domain/projects/status-word";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { isCalendarDate, FORMAT_ERROR as DATE_FORMAT_ERROR, EMPTY_ERROR as DATE_EMPTY_ERROR } from "@/domain/projects/period";
import { SaveRejectedError, type CellFormatError } from "@/domain/quotes/lines";
import { isUniqueViolation } from "@/lib/pg-errors";
import type { DbOrTx } from "@/repositories/document-counters";
import { findProjectInScope } from "@/repositories/projects";
import { findRevenueEntryById as repoFindRevenueEntryById } from "@/repositories/revenue-entries";
import {
  findIssueRequestById,
  insertIssueRequest,
  listIssueRequestRowsByProject,
  lockIssueRequest,
  markIssueRequestIssued,
  updateIssueRequestIfVersionMatches,
  type IssueRequestListRow,
  type IssueRequestRow,
} from "@/repositories/revenue-issue-requests";

// 06-18(D-610): PM이 세금계산서 발행을 요청하고, 매출 기록 권한자가 발행 줄로 이어 닫는다.
// 저장 · 잇기는 원장 일괄 저장(domain/projects/ledger)이 연 트랜잭션 안에서만 돈다 — 두 함수 모두 `tx`를 받고,
// 권한 판정은 트랜잭션 앞(원장), 행동 기록은 같은 트랜잭션 안 `recordAction(…, { tx })`다(06-03 tx 규약).
// domain/revenue는 이 모듈을 import하지 않는다(한 방향) — 잇기는 원장이 saveRevenueInTx 뒤에 부른다.

const REQUEST_ENTITY = "revenue_issue_request";
const WRITE_DENIED = "발행 요청 저장 권한 없음";
const OPEN_STATUSES: readonly string[] = ["bidding", "in_progress", "settling"] satisfies ProjectStatus[];

const NOT_FOUND = "요청을 찾을 수 없음 · 새로 고침";
const ALREADY_LINKED = "다른 사람이 먼저 이 요청을 이음 · 새로 고침";
const NOT_EDITABLE_ISSUED = "이미 발행됨 · 새로 고침";
const NOT_EDITABLE_CANCELLED = "취소된 요청 · 새로 고침";
const CHANGED_BY_OTHER = "다른 사람이 먼저 이 요청을 바꿈 · 새로 고침";
// 260907 invoice_requests_amount_positive — 요청 금액은 0원 초과만(검토 I-2).
const AMOUNT_POSITIVE_ERROR = "0원 초과 · 금액 입력";
const REPLAY_MISMATCH = "이미 저장된 요청과 값이 다름 · 새로 고침";

export type IssueRequestStatus = "requested" | "issued" | "cancelled";

export type IssueRequestWriteRow = {
  /** 화면이 만든 uuid(새 줄은 `isNew`와 함께 — 재전송에도 같은 id). */
  id: string;
  isNew?: true;
  version?: number;
  desiredIssueDate: string;
  /** 공급가 기준(발행 줄과 같은 기준 — O-12). 부가세 · 합계는 받지 않는다. */
  amount: MoneyInputDto;
  memo?: string | null;
};

// 트랜잭션을 열기 전에 읽는 쓰기 권리 — 원장이 잠그기 전에 부른다(잠근 트랜잭션 안 풀 호출 금지).
export async function assertIssueRequestWriteRight(viewer: Viewer, can: typeof defaultCan = defaultCan): Promise<void> {
  if (!(await can(viewer, "projects", "write"))) throw new ForbiddenError(WRITE_DENIED);
}

type Payload = {
  desiredIssueDate: string;
  amountCurrency: string;
  amountForeignAmount: string | null;
  amountFxRate: string;
  amountAmountKrw: number;
  memo: string | null;
};

function samePayload(stored: IssueRequestRow, payload: Payload): boolean {
  return (
    stored.desiredIssueDate === payload.desiredIssueDate &&
    stored.amountCurrency === payload.amountCurrency &&
    stored.amountForeignAmount === payload.amountForeignAmount &&
    stored.amountFxRate === payload.amountFxRate &&
    stored.amountAmountKrw === payload.amountAmountKrw &&
    stored.memo === payload.memo
  );
}

function prepare(rows: IssueRequestWriteRow[], errors: CellFormatError[]): Array<{ input: IssueRequestWriteRow; rowIndex: number; payload: Payload }> {
  const prepared: Array<{ input: IssueRequestWriteRow; rowIndex: number; payload: Payload }> = [];
  rows.forEach((input, rowIndex) => {
    if (input.desiredIssueDate === "") {
      errors.push({ rowIndex, rowId: input.id, field: "desiredIssueDate", label: "희망 발행일", reason: DATE_EMPTY_ERROR });
      return;
    }
    if (!isCalendarDate(input.desiredIssueDate)) {
      errors.push({ rowIndex, rowId: input.id, field: "desiredIssueDate", label: "희망 발행일", reason: DATE_FORMAT_ERROR });
      return;
    }
    try {
      const columns = moneyToColumns(input.amount);
      if (columns.amountKrw <= 0) {
        errors.push({ rowIndex, rowId: input.id, field: "amount", label: "금액", reason: AMOUNT_POSITIVE_ERROR });
        return;
      }
      prepared.push({
        input,
        rowIndex,
        payload: {
          desiredIssueDate: input.desiredIssueDate,
          amountCurrency: columns.currency,
          amountForeignAmount: columns.foreignAmount,
          amountFxRate: columns.fxRate,
          amountAmountKrw: columns.amountKrw,
          memo: input.memo ?? null,
        },
      });
    } catch (error) {
      if (!(error instanceof MoneyInputError)) throw error;
      errors.push({ rowIndex, rowId: input.id, field: "amount", label: "금액", reason: error.message });
    }
  });
  return prepared;
}

// 요청 줄 저장 — 새 줄은 `신청됨`으로 멱등 삽입하고, 기존 줄은 `신청됨`이고 아직 이어지지 않은 것만 version으로 고친다.
// 프로젝트 상태는 원장이 잠근 행의 값(`lockedStatus`)으로 판정한다(새 조회 없음).
export async function saveIssueRequestRows(
  viewer: Viewer,
  projectId: string,
  rows: IssueRequestWriteRow[],
  deps: { lockedStatus: string; recordAction?: typeof defaultRecordAction },
  tx: DbOrTx,
): Promise<{ written: number }> {
  if (rows.length === 0) return { written: 0 };
  if (!OPEN_STATUSES.includes(deps.lockedStatus)) {
    const word = PROJECT_STATUS_WORD[deps.lockedStatus as ProjectStatus] ?? deps.lockedStatus;
    throw new CompletedProjectError(`${word} · 발행 요청 잠김`);
  }

  const errors: CellFormatError[] = [];
  const prepared = prepare(rows, errors);
  if (errors.length > 0) throw new SaveRejectedError([], errors);

  const recordAction = deps.recordAction ?? defaultRecordAction;
  const rejections: CellFormatError[] = [];
  const reject = (rowIndex: number, rowId: string, reason: string) =>
    rejections.push({ rowIndex, rowId, field: "status", label: "상태", reason });
  let written = 0;

  for (const { input, rowIndex, payload } of prepared) {
    if (input.isNew) {
      const inserted = await insertIssueRequest(viewer, { id: input.id, projectId, requestedBy: viewer.id, ...payload }, tx);
      if (!inserted) {
        const stored = await findIssueRequestById(viewer, input.id, tx);
        if (!stored || stored.projectId !== projectId || !samePayload(stored, payload)) reject(rowIndex, input.id, REPLAY_MISMATCH);
        continue;
      }
      await recordAction(viewer, { actionType: "document_create", entity: REQUEST_ENTITY, entityId: input.id, detail: { projectId } }, { tx });
      written += 1;
      continue;
    }

    if (input.version === undefined) {
      reject(rowIndex, input.id, CHANGED_BY_OTHER);
      continue;
    }
    const updated = await updateIssueRequestIfVersionMatches(viewer, input.id, input.version, { projectId }, payload, tx);
    if (updated) {
      await recordAction(viewer, { actionType: "document_update", entity: REQUEST_ENTITY, entityId: input.id, detail: { projectId } }, { tx });
      written += 1;
      continue;
    }
    const stored = await findIssueRequestById(viewer, input.id, tx);
    if (!stored || stored.projectId !== projectId) reject(rowIndex, input.id, NOT_FOUND);
    else if (stored.status === "issued") reject(rowIndex, input.id, NOT_EDITABLE_ISSUED);
    else if (stored.status === "cancelled") reject(rowIndex, input.id, NOT_EDITABLE_CANCELLED);
    // 응답을 잃은 재전송 — 첫 커밋이 version을 하나 올렸고 값이 같으면 no-op(쓰기 · 기록 없음).
    else if (stored.version === input.version + 1 && samePayload(stored, payload)) continue;
    else reject(rowIndex, input.id, CHANGED_BY_OTHER);
  }
  if (rejections.length > 0) throw new SaveRejectedError([], rejections);
  return { written };
}

// 발행 줄 잇기 — 요청 행을 `FOR UPDATE`로 잠근 뒤 프로젝트 · 상태 · 이어짐을 판정한다(잠금 뒤 판정). 거부되면 같은 트랜잭션의
// 발행 줄 INSERT도 되돌아간다. 이미 같은 줄로 이어져 있으면(재전송) 쓰기 · 기록 없이 통과한다. 발행 줄 쓰기 권리는
// saveRevenueInTx가 이미 판정했다 — 여기서 다시 판정하지 않는다(U-4).
export async function linkIssueRequestToEntry(
  viewer: Viewer,
  requestId: string,
  entryId: string,
  deps: { projectId: string; rowIndex?: number; recordAction?: typeof defaultRecordAction },
  tx: DbOrTx,
): Promise<{ linked: boolean }> {
  const reject = (reason: string): never => {
    throw new SaveRejectedError([], [{ rowIndex: deps.rowIndex ?? 0, rowId: entryId, field: "amount", label: "발행 요청", reason }]);
  };
  const locked = await lockIssueRequest(viewer, requestId, tx);
  if (!locked || locked.projectId !== deps.projectId) return reject(NOT_FOUND);
  if (locked.status === "issued") {
    if (locked.issuedEntryId === entryId) return { linked: false };
    return reject(ALREADY_LINKED);
  }
  if (locked.status !== "requested") return reject(NOT_EDITABLE_CANCELLED);

  const entry = await repoFindRevenueEntryById(viewer, entryId, tx);
  if (!entry || entry.projectId !== deps.projectId || entry.kind !== "issue" || entry.archivedAt !== null) return reject(NOT_FOUND);

  let marked: IssueRequestRow | null;
  try {
    marked = await markIssueRequestIssued(viewer, requestId, entryId, tx);
  } catch (error) {
    if (isUniqueViolation(error, "revenue_issue_requests_issued_entry_uniq")) return reject(ALREADY_LINKED);
    throw error;
  }
  if (!marked) return reject(ALREADY_LINKED);

  const recordAction = deps.recordAction ?? defaultRecordAction;
  await recordAction(
    viewer,
    { actionType: "document_update", entity: REQUEST_ENTITY, entityId: requestId, detail: { projectId: deps.projectId, issuedEntryId: entryId } },
    { tx },
  );
  return { linked: true };
}

// 표 DTO — 칸마다 정보 항목으로 서버가 키를 가른다(A-605). 부가세 · 합계는 희망 발행일 기준 발행 줄과 같은 계산(computeVat)이다.
type IssueRequestProjectable = {
  id: string;
  desiredIssueDate: string;
  memo: string | null;
  status: IssueRequestStatus;
  version: number;
  issuedEntryId: string | null;
  issuedEntryDate: string | null;
  amountKrw: number;
  vatKrw: number;
  totalKrw: number;
  issuedAmountKrw: number | null;
};

export type IssueRequestDto = Partial<IssueRequestProjectable>;

const AMOUNT_KEYS = ["amountKrw", "vatKrw", "totalKrw"] as const;

export const ISSUE_REQUEST_DTO_SPEC: DtoSpec<IssueRequestProjectable, IssueRequestDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "project.value" },
    { key: "desiredIssueDate", from: "desiredIssueDate", infoItem: "project.value" },
    { key: "memo", from: "memo", infoItem: "project.value" },
    { key: "status", from: "status", infoItem: "project.value" },
    { key: "version", from: "version", infoItem: "project.value" },
    { key: "issuedEntryId", from: "issuedEntryId", infoItem: "project.value" },
    { key: "issuedEntryDate", from: "issuedEntryDate", infoItem: "project.value" },
    // 요청 금액 · 부가세 · 합계는 발행액을 볼 수 있을 때 — 요청을 적는 프로젝트 쓰기 권한자는 아래 listProjectIssueRequests가 더한다.
    { key: "amountKrw", from: "amountKrw", infoItem: "revenue.issued_amount" },
    { key: "vatKrw", from: "vatKrw", infoItem: "revenue.issued_amount" },
    { key: "totalKrw", from: "totalKrw", infoItem: "revenue.issued_amount" },
    // 상태 2행의 발행액(이어진 발행 줄의 금액)은 발행액을 볼 수 있는 사람에게만(A-605 — 요청 상태를 통한 우회 노출 없음).
    { key: "issuedAmountKrw", from: "issuedAmountKrw", infoItem: "revenue.issued_amount" },
  ],
};

registerDto({
  name: "IssueRequestDto",
  fields: ISSUE_REQUEST_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

async function toProjectable(row: IssueRequestListRow, deps?: Partial<RevenueDeps>): Promise<IssueRequestProjectable> {
  const vat = await computeVat(row.amountAmountKrw, new Date(row.desiredIssueDate), deps);
  return {
    id: row.id,
    desiredIssueDate: row.desiredIssueDate,
    memo: row.memo,
    status: row.status as IssueRequestStatus,
    version: row.version,
    issuedEntryId: row.issuedEntryId,
    issuedEntryDate: row.issuedEntryDate,
    amountKrw: row.amountAmountKrw,
    vatKrw: vat.vatKrw,
    totalKrw: vat.totalKrw,
    issuedAmountKrw: row.issuedAmountKrw,
  };
}

export async function listProjectIssueRequests(
  viewer: Viewer,
  projectId: string,
  deps?: Partial<RevenueDeps> & { can?: typeof defaultCan },
): Promise<IssueRequestDto[]> {
  // domain/projects의 findProject와 같은 검사(보기 범위 + 아카이브)를 listRevenue처럼 최소 복제한다.
  // 06.2(D-6208): 프로젝트 범위 — 260907 `O: server/src/settlement.ts:453` 참여자 조각 누락을 따르지 않는다.
  const scope = await projectRowScope(viewer);
  if (scope.rows === "none") throw new ProjectNotFoundError("존재하지 않는 프로젝트");
  const projectRow = await findProjectInScope(viewer, scope, projectId);
  if (!projectRow || (projectRow.archivedAt !== null && !scope.includeArchived)) throw new ProjectNotFoundError("존재하지 않는 프로젝트");

  const rows = await listIssueRequestRowsByProject(viewer, projectId);
  const projectables = await Promise.all(rows.map((row) => toProjectable(row, deps)));
  const projected = await projectMany(viewer, projectables, ISSUE_REQUEST_DTO_SPEC);

  // A-605 계획 판단 — 요청을 적는 프로젝트 쓰기 권한자는 발행액 정보 항목과 무관하게 요청 금액 · 부가세 · 합계를 본다.
  const canWrite = await (deps?.can ?? defaultCan)(viewer, "projects", "write");
  if (!canWrite) return projected;
  return projected.map((dto, index) => {
    const source = projectables[index];
    if (!source || "amountKrw" in dto) return dto;
    return { ...dto, ...Object.fromEntries(AMOUNT_KEYS.map((key) => [key, source[key]])) };
  });
}
