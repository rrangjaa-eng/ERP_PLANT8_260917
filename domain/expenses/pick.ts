import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { normalizeVendorName } from "@/domain/vendors";
import {
  codeLabelsOf,
  doorBlock,
  doorFor,
  EXPENSE_DOCUMENT_KIND,
  ExpenseNotFoundError,
  isEditableByDrafter,
  lineExecution,
  lineRemainingText,
  listNumberedByLineageMany,
  loadProjectFactsMany,
  numberedSupplyText,
  staticLineBlock,
} from "@/domain/expenses";
import { coversProjectTeam, loadActorTeamScope } from "@/domain/projects/status";
import { getSettingValue } from "@/domain/settings/registry";
import { PROJECT_CUSTOMER_APPROVAL_GATE } from "@/domain/settings/keys";
import type { Money } from "@/domain/money";
import { seoulToday } from "@/lib/dates";
import type { NumberedLineExpense } from "@/repositories/expenses";
import { findExpenseApprovalStatus, findExpenseApprovalStatuses, findExpenseById, listPickProjects } from "@/repositories/expenses";
import { findProjectById } from "@/repositories/projects";
import { listQuoteLinesByRevisions, type QuoteLineRow } from "@/repositories/quote-lines";
import { findVendorNamesByIds, listVendorsForPick } from "@/repositories/vendors";

// 05-07 골라내기(S14) 서버 판정 — 행마다 고를 수 있음 · 이유 · 그룹을 서버가 만든다. 행은 투영 DTO다(폼 선택지도 `registerDto`된
// DTO — 누수 스캔 DTO 축이 본다). 한 번에 50행까지, 넘으면 truncated.

export const PICK_LIMIT = 50;

// 거래처 행 — 이름 · 기본 증빙 종류(코드 값 · 이름)는 거래처 정보(vendor.value)다. 프로젝트 등록 폼 선택지(`ProjectVendorOptionDto`)와 같은 항목.
export type PickVendorOptionDto = {
  id: string;
  name: string;
  defaultEvidenceType: string | null;
  defaultEvidenceName: string | null;
};

export const PICK_VENDOR_OPTION_SPEC: DtoSpec<PickVendorOptionDto, PickVendorOptionDto> = {
  fields: (["id", "name", "defaultEvidenceType", "defaultEvidenceName"] as const).map((key) => ({ key, from: key, infoItem: "vendor.value" })),
};

registerDto({ name: "PickVendorOptionDto", fields: PICK_VENDOR_OPTION_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 거래처 고르기 · 바꾸기 — 숨김 · 보관 거래처는 목록에 없다. 검색어는 이름 부분 일치(비면 이름순 앞 50행).
// 정보 노출표가 vendor.value를 가리면 행이 비어 id째 없다(이름이 새지 않는다).
export async function searchVendorsForPick(viewer: Viewer, input: { query: string }): Promise<{ rows: Partial<PickVendorOptionDto>[]; truncated: boolean }> {
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  const found = await listVendorsForPick(viewer, { normalizedQuery: normalizeVendorName(input.query), limit: PICK_LIMIT + 1 });
  const evidenceNames = await codeLabelsOf(viewer, "evidence_type");
  const options: PickVendorOptionDto[] = found.slice(0, PICK_LIMIT).map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    defaultEvidenceType: vendor.defaultEvidenceType,
    defaultEvidenceName: vendor.defaultEvidenceType ? (evidenceNames.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType) : null,
  }));
  const rows = (await projectMany(viewer, options, PICK_VENDOR_OPTION_SPEC)).filter((row) => row.id !== undefined);
  return { rows, truncated: found.length > PICK_LIMIT };
}

// ── 견적 줄 골라내기 ─────────────────────────────────────────────────────

// 줄 행 — 정보 항목은 Phase 4 `QUOTE_LINE_DTO_SPEC`의 같은 필드를 따른다(번호 · 항목 = project.value, 실행가 = quote.amount, 거래처 이름 = project.value ∧ vendor.value).
// 이유 · 회차 글자에는 문서 번호 · 금액이 들어 있어 금액 항목이 함께 걸린다.
export type PickLineOptionDto = {
  id: string;
  projectId: string;
  lineNo: number;
  itemName: string;
  vendorName: string | null;
  execution: Money;
  selectable: boolean;
  // 고를 수 없는 이유(거래처 없음 · 지출결의 번호 · 상태 · 금액). 표 전체 게이트(change)는 그룹 note 한 번이다.
  reason: string | null;
  // 앞 회차가 있는 열린 줄의 `N회차 · 남은 실행가 …`.
  installmentText: string | null;
  current: boolean;
};

export const PICK_LINE_OPTION_SPEC: DtoSpec<PickLineOptionDto, PickLineOptionDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "project.value" },
    { key: "projectId", from: "projectId", infoItem: "project.value" },
    { key: "lineNo", from: "lineNo", infoItem: "project.value" },
    { key: "itemName", from: "itemName", infoItem: "project.value" },
    { key: "vendorName", from: "vendorName", infoItem: ["project.value", "vendor.value"] },
    { key: "execution", from: "execution", infoItem: "quote.amount" },
    { key: "selectable", from: "selectable", infoItem: "project.value" },
    { key: "reason", from: "reason", infoItem: ["project.value", "expense.amount"] },
    { key: "installmentText", from: "installmentText", infoItem: "quote.amount" },
    { key: "current", from: "current", infoItem: "project.value" },
  ],
};

// 프로젝트 그룹 머리글 — 이름은 프로젝트 정보다. note는 접힌 그룹 사유(`2차 고객 승인 전`) · change의 표 전체 게이트 글자.
export type PickLineGroupDto = { projectId: string; label: string; note: string | null };

export const PICK_LINE_GROUP_SPEC: DtoSpec<PickLineGroupDto, PickLineGroupDto> = {
  fields: (["projectId", "label", "note"] as const).map((key) => ({ key, from: key, infoItem: "project.value" })),
};

registerDto({ name: "PickLineOptionDto", fields: PICK_LINE_OPTION_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerDto({ name: "PickLineGroupDto", fields: PICK_LINE_GROUP_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 기본 목록(검색어 없음) = 내가 담당 PM인 수주중 · 진행 프로젝트, 검색 = 내 쓰기 권리 범위의 수주중 · 진행 · 정산 프로젝트(완료 · 미수주는 새 문서가 없다).
const DEFAULT_PICK_STATUSES = ["bidding", "in_progress"] as const;
const SEARCH_PICK_STATUSES = ["bidding", "in_progress", "settling"] as const;
// 후보 프로젝트 상한(권리 거르기 전) — 한 프로젝트 줄 수가 한 번에 읽는 양을 정한다.
const PICK_PROJECT_LIMIT = 100;

const APPROVAL_STATUS_WORDS: Record<string, string> = { submitted: "결재 중", in_review: "결재 중", approved: "승인", rejected: "반려", withdrawn: "회수" };

// change = 그 문서 프로젝트의 현재 차수 줄 전부(문서가 기안자가 고칠 수 있는 줄 문서여야 한다 — isEditableByDrafter, 05-09), pick = 위 기본 · 검색 목록(팀 비용 문서 · 새 문서에서 줄을 고른다).
// 줄마다 고를 수 있음 · 이유는 createExpenseFromLines · changeExpenseLine과 같은 판정(표 전체 게이트 · 문 상태)으로 서버가 만든다. 한 번에 50행 + truncated.
export async function searchLinesForPick(
  viewer: Viewer,
  input: { mode: "change" | "pick"; expenseId?: string; query?: string },
): Promise<{ groups: Partial<PickLineGroupDto>[]; rows: Partial<PickLineOptionDto>[]; truncated: boolean }> {
  const [canWriteExpense, canWriteProject] = await Promise.all([can(viewer, "expenses", "write"), can(viewer, "projects", "write")]);
  if (!canWriteExpense || !canWriteProject) throw new ForbiddenError("지출결의 작성 권한 없음");
  const query = (input.query ?? "").trim();
  const [gateEnabled, teamScope] = await Promise.all([getSettingValue(PROJECT_CUSTOMER_APPROVAL_GATE), loadActorTeamScope(viewer, { todayKst: seoulToday() })]);

  let candidates: Awaited<ReturnType<typeof listPickProjects>>;
  let currentLineId: string | null = null;
  if (input.mode === "change") {
    const expense = input.expenseId && z.string().uuid().safeParse(input.expenseId).success ? await findExpenseById(viewer, input.expenseId) : null;
    if (!expense || !expense.projectId) throw new ExpenseNotFoundError();
    const status = expense.number === null ? null : await findExpenseApprovalStatus(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: expense.id });
    if (!isEditableByDrafter(viewer.id, expense, status)) throw new ExpenseNotFoundError();
    const projectRow = await findProjectById(viewer, expense.projectId);
    if (!projectRow) throw new ExpenseNotFoundError();
    currentLineId = expense.quoteLineId;
    candidates = [projectRow];
  } else {
    candidates = await listPickProjects(viewer, {
      pmUserId: query === "" ? viewer.id : null,
      statuses: query === "" ? DEFAULT_PICK_STATUSES : SEARCH_PICK_STATUSES,
      query: query === "" ? null : query,
      limit: PICK_PROJECT_LIMIT,
    });
  }

  const lowered = query.toLowerCase();
  // 후보 프로젝트의 사실 · 현재 차수 줄 · 계보 문서 · 거래처 이름 · 결재 상태를 묶어 읽는다(후보마다 따로 읽지 않는다 — 05 /review A7).
  const eligible = candidates.filter((candidate) => candidate.pmUserId === viewer.id || coversProjectTeam(teamScope, candidate.teamId));
  const factsByProject = await loadProjectFactsMany(viewer, eligible, gateEnabled);
  const listed = eligible.filter((candidate) => {
    const facts = factsByProject.get(candidate.id);
    return Boolean(facts?.latestRevisionId) && !(facts?.tableGateReason && input.mode === "pick");
  });
  const [allLines, numberedByProject] = await Promise.all([
    listQuoteLinesByRevisions(viewer, listed.flatMap((candidate) => factsByProject.get(candidate.id)?.latestRevisionId ?? [])),
    listNumberedByLineageMany(viewer, listed.map((candidate) => candidate.id)),
  ]);
  const linesByRevision = new Map<string, QuoteLineRow[]>();
  for (const line of allLines) linesByRevision.set(line.revisionId, [...(linesByRevision.get(line.revisionId) ?? []), line]);
  const numberedIds = [...numberedByProject.values()].flatMap((byLine) => [...byLine.values()].flat().map((doc) => doc.id));
  const [vendorNames, statuses] = await Promise.all([
    findVendorNamesByIds(viewer, [...new Set(allLines.flatMap((line) => (line.vendorId ? [line.vendorId] : [])))]),
    findExpenseApprovalStatuses(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentIds: [...new Set(numberedIds)] }),
  ]);

  const groups: PickLineGroupDto[] = [];
  const rows: PickLineOptionDto[] = [];
  for (const candidate of eligible) {
    if (rows.length > PICK_LIMIT) break;
    const facts = factsByProject.get(candidate.id);
    if (!facts?.latestRevisionId) continue;
    const label = `${candidate.number} ${candidate.name}`;
    if (facts.tableGateReason && input.mode === "pick") {
      // 표 전체 게이트에 막힌 프로젝트 — 줄 없이 그룹 한 줄로 접는다(`2차 고객 승인 전`).
      groups.push({ projectId: candidate.id, label, note: facts.tableGateReason.split(" · ")[0] ?? facts.tableGateReason });
      continue;
    }

    const lines = (linesByRevision.get(facts.latestRevisionId) ?? []).filter((line) => line.archivedAt === null);
    lines.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const projectMatches = lowered === "" || candidate.name.toLowerCase().includes(lowered) || candidate.number.toLowerCase().includes(lowered);
    const numbered = numberedByProject.get(candidate.id) ?? new Map<string, NumberedLineExpense[]>();

    const projectRows: PickLineOptionDto[] = [];
    for (const [index, line] of lines.entries()) {
      const vendorName = line.vendorId ? (vendorNames.get(line.vendorId) ?? null) : null;
      if (!projectMatches && !line.itemName.toLowerCase().includes(lowered) && !(vendorName ?? "").toLowerCase().includes(lowered)) continue;
      const docs = numbered.get(line.id) ?? [];
      const door = doorFor(line, docs);
      if (door.state === "none") continue;

      let selectable = true;
      let reason: string | null = null;
      if (facts.tableGateReason) {
        selectable = false;
      } else if (staticLineBlock(line, facts)) {
        selectable = false;
      } else if (doorBlock(door)) {
        selectable = false;
        if (door.state === "no_vendor") {
          reason = "거래처 없음";
        } else {
          const latest = docs.find((doc) => doc.id === door.latest?.id) ?? docs.at(-1);
          const status = latest ? (statuses.get(latest.id) ?? null) : null;
          const word = status ? (APPROVAL_STATUS_WORDS[status] ?? "") : "";
          reason = `지출결의 ${door.latest?.number ?? ""}${word ? ` ${word}` : ""}${latest ? ` · ${numberedSupplyText(latest)}` : ""}`;
        }
      }
      projectRows.push({
        id: line.id,
        projectId: candidate.id,
        lineNo: index + 1,
        itemName: line.itemName,
        vendorName,
        execution: lineExecution(line),
        selectable,
        reason,
        installmentText: selectable && door.forcedInstallment ? `${door.nextInstallmentSeq}회차 · 남은 실행가 ${lineRemainingText(line, docs)}` : null,
        current: line.id === currentLineId,
      });
    }
    if (projectRows.length === 0 && input.mode === "pick") continue;
    groups.push({ projectId: candidate.id, label, note: input.mode === "change" ? facts.tableGateReason : null });
    rows.push(...projectRows);
  }

  const truncated = rows.length > PICK_LIMIT;
  const kept = rows.slice(0, PICK_LIMIT);
  const keptProjects = new Set(kept.map((row) => row.projectId));
  // 상한으로 줄이 모두 잘린 그룹은 머리글만 남지 않게 뺀다(접힌 그룹 — note가 있는 줄 없는 그룹 — 은 그대로).
  const keptGroups = groups.filter((group) => group.note !== null || keptProjects.has(group.projectId));
  const [projectedGroups, projectedRows] = await Promise.all([
    projectMany(viewer, keptGroups, PICK_LINE_GROUP_SPEC),
    projectMany(viewer, kept, PICK_LINE_OPTION_SPEC),
  ]);
  return { groups: projectedGroups.filter((group) => group.projectId !== undefined), rows: projectedRows.filter((row) => row.id !== undefined), truncated };
}
