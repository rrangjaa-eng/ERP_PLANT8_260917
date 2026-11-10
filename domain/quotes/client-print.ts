import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { canOpenRevision } from "@/domain/projects/visibility";
import { QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";
import { sumKrw } from "@/domain/money";
import { ForbiddenError } from "@/domain/quotes/lines";
import { listCodeItems } from "@/repositories/code-tables";
import { findProjectById } from "@/repositories/projects";
import { listQuoteLinesByRevision } from "@/repositories/quote-lines";
import { findQuoteRevisionById } from "@/repositories/quote-revisions";
import { findUserById } from "@/repositories/users";
import { findVendorNamesByIds } from "@/repositories/vendors";

// 07.2-10 PU3(D-7221 · D-7224 · D-7229) — 고객 견적서 인쇄용 투영. 260907 client-quotation처럼 「감추는 것을 아예 싣지 않는다」:
// 이 모듈의 타입에는 협력사 · 실행가 · 차익 · 내부 비고 · 조정 줄 · 취소 줄을 담을 칸이 없다. 입력 행(QuoteClientPrintSourceRow)도 필요한 칸만 받는다.
// 읽기 권리 = 금액 노출(quote.amount) + 프로젝트 메뉴 쓰기 + 쓰기 용도 행 범위 + 열린 프로젝트(완료 · 보관은 닫힘 — 결정 j).

const PROJECTS_MENU = "projects";

export type QuoteClientPrintSourceRow = {
  id: string;
  lineKind: string;
  lineStatus: string;
  subcategory: string;
  majorCategory: string | null;
  midCategory: string | null;
  itemName: string;
  quantity: number;
  days: number;
  unitPriceKrw: number;
  quoteAmountKrw: number;
  clientRemark: string | null;
};

export type QuoteClientPrintLine = {
  id: string;
  major: string;
  mid: string | null;
  item: string;
  quantity: number;
  unitPriceKrw: number;
  days: number;
  amountKrw: number;
  remark: string | null;
};

export type QuoteClientPrintGroup = { major: string; subtotalKrw: number };
export type QuoteClientPrintCommission = { id: string; item: string; amountKrw: number; remark: string | null };

export type QuoteClientPrintHeader = {
  ref: string;
  projectId: string;
  clientName: string | null;
  eventName: string;
  pmName: string | null;
};

export type QuoteClientPrintDto = QuoteClientPrintHeader & {
  lines: QuoteClientPrintLine[];
  groups: QuoteClientPrintGroup[];
  totalKrw: number;
  commissionLines: QuoteClientPrintCommission[];
  commissionKrw: number;
  grandTotalKrw: number;
};

export const QUOTE_CLIENT_PRINT_DTO_SPEC: DtoSpec<QuoteClientPrintDto, QuoteClientPrintDto> = {
  fields: [
    { key: "ref", from: "ref", infoItem: "project.value" },
    { key: "projectId", from: "projectId", infoItem: "project.value" },
    { key: "clientName", from: "clientName", infoItem: "project.value" },
    { key: "eventName", from: "eventName", infoItem: "project.value" },
    { key: "pmName", from: "pmName", infoItem: "project.value" },
    { key: "lines", from: "lines", infoItem: "quote.amount" },
    { key: "groups", from: "groups", infoItem: "quote.amount" },
    { key: "totalKrw", from: "totalKrw", infoItem: "quote.amount" },
    { key: "commissionLines", from: "commissionLines", infoItem: "quote.amount" },
    { key: "commissionKrw", from: "commissionKrw", infoItem: "quote.amount" },
    { key: "grandTotalKrw", from: "grandTotalKrw", infoItem: "quote.amount" },
  ],
};

registerDto({
  name: "QuoteClientPrintDto",
  fields: QUOTE_CLIENT_PRINT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

function isCounted(row: QuoteClientPrintSourceRow, kind: "quote" | "commission"): boolean {
  return row.lineKind === kind && row.lineStatus !== "cancelled";
}

// 순수 투영 — DB에 닿지 않는다. 견적 줄은 대분류(저장값, 없으면 소분류 이름표)로 처음 나온 자리에 모으고, 그 안에서 중분류 없는 줄이 먼저,
// 중분류는 처음 나온 순서다. 금액은 저장 견적가 그대로 합한다(재계산하지 않는다 — 승인 합계와 같은 값).
export function buildQuoteClientPrint(header: QuoteClientPrintHeader, rows: readonly QuoteClientPrintSourceRow[], label: (subcategory: string) => string): QuoteClientPrintDto {
  const byMajor = new Map<string, QuoteClientPrintSourceRow[]>();
  for (const row of rows.filter((candidate) => isCounted(candidate, "quote"))) {
    const major = row.majorCategory || label(row.subcategory);
    const group = byMajor.get(major);
    if (group) group.push(row);
    else byMajor.set(major, [row]);
  }

  const lines: QuoteClientPrintLine[] = [];
  const groups: QuoteClientPrintGroup[] = [];
  for (const [major, items] of byMajor) {
    const mids = [...new Set(items.map((item) => item.midCategory || null))];
    const ordered = mids.includes(null) ? [null, ...mids.filter((mid) => mid !== null)] : mids;
    for (const mid of ordered) {
      for (const item of items.filter((candidate) => (candidate.midCategory || null) === mid)) {
        lines.push({
          id: item.id,
          major,
          mid,
          item: item.itemName,
          quantity: item.quantity,
          unitPriceKrw: item.unitPriceKrw,
          days: item.days,
          amountKrw: item.quoteAmountKrw,
          remark: item.clientRemark,
        });
      }
    }
    groups.push({ major, subtotalKrw: sumKrw(items.map((item) => item.quoteAmountKrw)) });
  }

  const commissionRows = rows.filter((candidate) => isCounted(candidate, "commission"));
  const commissionLines = commissionRows.map((row) => ({ id: row.id, item: row.itemName, amountKrw: row.quoteAmountKrw, remark: row.clientRemark }));
  const totalKrw = sumKrw(groups.map((group) => group.subtotalKrw));
  const commissionKrw = sumKrw(commissionRows.map((row) => row.quoteAmountKrw));
  return { ...header, lines, groups, totalKrw, commissionLines, commissionKrw, grandTotalKrw: totalKrw + commissionKrw };
}

// 인쇄 읽기 · 입구 · 기록이 같은 판정을 부른다 — 읽기만 가진 사람이 주소로 열어 PDF를 내고 기록은 실패하는 구멍을 막는다(D-7229).
// 용도 인자 "write"를 반드시 넘긴다: 기본 "view"는 자금 키로 넓힌 보기 범위라 인쇄 권리가 입구 · 기록보다 다시 넓어진다(#333).
async function loadPrintable(viewer: Viewer, revisionId: string) {
  if (!(await defaultVisible(viewer, "quote.amount"))) return null;
  if (!(await defaultCan(viewer, PROJECTS_MENU, "write"))) return null;
  if (!(await canOpenRevision(viewer, revisionId, "write"))) return null;
  const revision = await findQuoteRevisionById(viewer, revisionId);
  if (!revision) return null;
  const project = await findProjectById(viewer, revision.projectId);
  // canOpenProject는 보관 보기 권리자에게 보관 프로젝트를 열어 준다 — 인쇄는 명시 거부한다(결정 j).
  if (!project || project.archivedAt !== null || project.status === "completed") return null;
  return { seq: revision.seq, project };
}

export async function canPrintQuoteRevision(viewer: Viewer, revisionId: string): Promise<boolean> {
  return (await loadPrintable(viewer, revisionId)) !== null;
}

export async function getQuoteClientPrint(viewer: Viewer, revisionId: string): Promise<QuoteClientPrintDto | null> {
  if (!(await defaultVisible(viewer, "quote.amount"))) throw new ForbiddenError("견적 금액 조회 권한 없음");
  const printable = await loadPrintable(viewer, revisionId);
  if (!printable) return null;
  const { seq, project } = printable;

  const [lineRows, labels, vendorNames, pm] = await Promise.all([
    listQuoteLinesByRevision(viewer, revisionId),
    listCodeItems(viewer, { tableKey: QUOTE_SUBCATEGORY_TABLE_KEY, scope: { rows: "all", includeArchived: true }, includeInactive: true }),
    findVendorNamesByIds(viewer, [project.clientId]),
    findUserById(viewer, project.pmUserId),
  ]);
  const labelOf = (value: string) => labels.find((item) => item.value === value)?.label ?? value;
  const rows = lineRows.map((row) => ({
    id: row.id,
    lineKind: row.lineKind,
    lineStatus: row.lineStatus,
    subcategory: row.subcategory,
    majorCategory: row.majorCategory,
    midCategory: row.midCategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    days: Number(row.days),
    unitPriceKrw: row.unitPriceAmountKrw,
    quoteAmountKrw: row.quoteAmountKrw,
    clientRemark: row.clientRemark,
  }));
  const dto = buildQuoteClientPrint(
    { ref: `${project.number}-${seq}`, projectId: project.id, clientName: vendorNames.get(project.clientId) ?? null, eventName: project.name, pmName: pm?.name ?? null },
    rows,
    labelOf,
  );
  const [projected] = await projectMany(viewer, [dto], QUOTE_CLIENT_PRINT_DTO_SPEC);
  if (!projected || projected.ref === undefined || projected.lines === undefined) return null;
  return projected as QuoteClientPrintDto;
}
