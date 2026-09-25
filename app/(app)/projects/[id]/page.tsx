import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { findProject } from "@/domain/projects";
import { listProjectFormReferences } from "@/domain/projects/references";
import { getCurrentQuoteRevision, listQuoteLines } from "@/domain/quotes/lines";
import { listRevisionSummaries } from "@/domain/quotes/revisions";
import { listRevenue } from "@/domain/revenue";
import { recentFxRate } from "@/domain/money/currency";
import { getSettingValue } from "@/domain/settings/registry";
import { QUOTE_LINE_MAX_PER_REVISION } from "@/domain/settings/keys";
import {
  lineCellEditability,
  quoteLockReason,
  quoteTableEmptyState,
  structuralEditability,
} from "@/domain/quotes/edit-scope";
import {
  actorCoversProjectTeam,
  isEndDatePassed,
  lastStatusChangeOn,
  listProjectStatusCatalog,
  statusDestinations,
} from "@/domain/projects/status";
import { projectResponsibles } from "@/domain/projects/responsibles";
import { periodEditRights } from "@/domain/projects/period";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import { addDays, kstToday } from "@/lib/kst-date";
import { PROJECT_STATUS_TAG_KIND } from "../status-display";
import { QuoteLedger } from "./quote-table";
import { RevisionSection } from "./revision-section";
import type { StatusChangeProps } from "./status-change";
import type { CustomerApprovalProps, NewRevisionProps } from "./revision-dialogs";
import { getPerson } from "@/domain/people";

// SYSTEM.md §6-2 상세 화면 — 이 리포의 첫 목록/상세 분리 화면. 네 숫자 줄
// (PNL-01)·차수 섹션의 마크업은 이 플랜에 없다(04-06/04-09). 매출 섹션은
// 04-02가 더한다. WR-07: 인증 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "projects", "view"))) notFound();

  const { id } = await params;
  const project = await findProject(session.viewer, id);
  if (!project) notFound();

  const todayKst = kstToday(new Date());
  const [canWrite, canAdjust, canWriteEntries, canEditPeriod, actorCoversTeam, revision] = await Promise.all([
    can(session.viewer, "projects", "write"),
    // 04-23(D-83) — 조정 줄 권한은 서버가 계산해 넘긴다(화면이 계급을 추론하지 않는다).
    can(session.viewer, "projects.adjustment", "write"),
    can(session.viewer, "projects.revenue", "write"),
    can(session.viewer, "projects.period", "write"),
    actorCoversProjectTeam(session.viewer, project, { todayKst }),
    getCurrentQuoteRevision(session.viewer, project.id),
  ]);

  // D-53: 프로젝트를 등록하면 상세 견적 1차가 항상 함께 생긴다 — 없으면
  // 데이터 결함이라 목록/등록 경로 밖에서 도달할 수 없는 상태로 다룬다.
  if (!revision) notFound();

  const status = PROJECT_STATUSES.find((value) => value === project.status);
  if (!status) notFound();

  // (가) 셀 편집 가능성은 서버가 판정해 보낸다 — 화면은 project.status 문자열을 다시 해석하지 않는다.
  // 04-30(D-78) — 기존 줄은 DTO의 칸별 cellEditability, 저장 전 새 줄은 같은 함수의 isNewLine 판정,
  // 줄 구조(추가·보관·이동·복제)는 structuralEditability 결과만 넘긴다.
  // 금액을 볼 수 없으면 표를 편집하지 않는다 — 서버도 저장을 거부한다(saveQuoteLines).
  const canSeeAmount = await visible(session.viewer, "quote.amount");
  const canEditLines = canWrite && canSeeAmount;
  const structural = structuralEditability({ status: project.status, canWrite: canEditLines });
  // 04-24(ENG-D7) — 승인 차수의 새 줄은 수량·단가가 잠긴 채 생긴다(기존 줄은 DTO의 칸 단계 — 04-40).
  const approvedSeq = revision.approved ? revision.seq : null;
  const newLineCells = lineCellEditability({ status: project.status, canWrite: canEditLines, hasLinkedDocuments: false, isNewLine: true, approvedSeq });
  // 04-23(D-48) — 견적 외 비용 새 줄은 견적 줄 구조(structural.insert)로 만들고 수량·단가가 늘 잠긴다.
  const outOfQuoteLineCells = lineCellEditability({
    status: project.status,
    canWrite: canEditLines,
    hasLinkedDocuments: false,
    isNewLine: true,
    lineKind: "out_of_quote",
  });
  const canAdjustLines = canAdjust && canSeeAmount;
  const adjustmentStructural = structuralEditability({ status: project.status, canWrite: canEditLines, lineKind: "adjustment", canAdjust: canAdjustLines });
  const adjustmentLineCells = lineCellEditability({
    status: project.status,
    canWrite: canEditLines,
    hasLinkedDocuments: false,
    isNewLine: true,
    lineKind: "adjustment",
    canAdjust: canAdjustLines,
  });

  // 04-22(S13 · 사용자 D14·D11·D20 · 사용자 결정 2026-09-25 「기간만 수정」) — 기간 권리. 팀장 이상은
  // projects.period 쓰기 + 자기 팀, 담당 PM은 projects 쓰기가 있을 때만.
  const periodRights = periodEditRights({
    status,
    isAssignedPm: project.pmUserId === session.viewer.id,
    canWrite,
    canEditPeriod,
    actorCoversTeam,
  });
  // 04-44(DR-37) — 총 매출 예상가는 기간과 같은 권리 + 금액 노출(볼 수 없는 값은 고칠 수 없다).
  const canEditPreEstimate = periodRights !== "none" && canSeeAmount;
  const [lines, references, revenue, usdDefaultFxRate, destinations, catalog, statusSince, lineCap, revisionSummaries] = await Promise.all([
    listQuoteLines(session.viewer, revision.id, { status: project.status, canWrite: canEditLines, canAdjust: canAdjustLines }),
    // 04-23(CEO 리뷰 B-23) — 조정 권한만 있어도 조정 줄의 거래처 칸을 고른다.
    canWrite || canAdjust ? listProjectFormReferences(session.viewer) : Promise.resolve(null),
    listRevenue(session.viewer, project.id),
    recentFxRate("USD"),
    statusDestinations(session.viewer, project),
    listProjectStatusCatalog(session.viewer),
    lastStatusChangeOn(session.viewer, project),
    // 04-26(D-86) — 화면의 상한 판정과 문구의 숫자는 서버 게이트가 읽는 같은 설정 값이다.
    getSettingValue(QUOTE_LINE_MAX_PER_REVISION),
    // 04-24(S5 · D-53) — 차수 요약(최신 순번부터). 현재 차수 행의 줄 수가 새 차수 다이얼로그의 {k}다.
    listRevisionSummaries(session.viewer, project.id),
  ]);
  const currentSummary = revisionSummaries.find((row) => row.revisionId === revision.id);

  // 04-24(D-53 · CEO-D10 · B-02) — 「복사해 새 차수」 렌더 조건은 새 차수 게이트의 입력과 같은 canCreateRevision 하나다.
  const newRevision: NewRevisionProps | null = structuralEditability({ status: project.status, canWrite }).newRevision
    ? {
        projectId: project.id,
        revisionId: revision.id,
        seq: revision.seq,
        lineCount: currentSummary?.lineCount ?? 0,
        adjustmentCount: lines.filter((line) => line.lineKind === "adjustment").length,
      }
    : null;

  // 04-24(D-56 · CEO-D19 · 리뷰 B-30 · ENG-D9) — 고객 승인 줄. 버튼은 담당 PM + projects 쓰기 + 완료 아님 + 현재 차수
  // 요약 행에 합계 키가 있을 때(견적 금액을 볼 때)만. 승인일 글자는 서버가 만든 KST 날짜 문자열 그대로(B-25).
  const approvedBy = currentSummary?.approvedBy ?? null;
  const approverName = approvedBy ? ((await getPerson(session.viewer, approvedBy))?.person.name ?? null) : null;
  const approvalText = currentSummary?.approvedOn
    ? [`고객 승인 ${currentSummary.approvedOn}`, approverName].filter(Boolean).join(" ")
    : null;
  const seenTotalKrw = currentSummary?.totalKrw;
  const contentToken = currentSummary?.contentToken;
  const canToggleApproval = project.pmUserId === session.viewer.id && canWrite && status !== "completed";
  const customerApproval: CustomerApprovalProps = {
    revisionId: revision.id,
    seq: revision.seq,
    approvalText,
    approvedOn: currentSummary?.approvedOn ?? null,
    control:
      !canToggleApproval || seenTotalKrw === undefined || contentToken === undefined
      ? null
      : !revision.approved
        ? { kind: "approve", totalKrw: seenTotalKrw, contentToken, todayKst }
        : lines.some((line) => line.hasLinkedDocuments)
          ? null
          : { kind: "cancel" },
  };

  // A-12: 1차 「일괄 저장」은 이 화면에서 쓸 수 있는 칸이 하나라도 있을 때만 — 판정은 서버가 칸마다 한다.
  // 04-30 — 표 항은 「편집 가능 셀이 하나라도 있거나 줄을 추가할 수 있음」(셀 단계·구조에서 온다).
  // canEditPreEstimate는 periodRights 항에 이미 포함되지만 칸 목록을 드러내려고 둔다(명시용).
  const hasEditableCell = lines.some((line) => Object.values(line.cellEditability).includes("edit"));
  const canSave =
    hasEditableCell ||
    structural.insert ||
    adjustmentStructural.insert ||
    periodRights !== "none" ||
    canEditPreEstimate ||
    canWriteEntries ||
    (canWrite && status !== "completed");

  // 04-21(S3·S7) — 갈 곳이 없으면 「상태 바꾸기」를 렌더하지 않는다(비활성 버튼이 아니다).
  // 화면은 상태 문자열로 권한을 추론하지 않고 서버의 갈 곳 목록만 본다.
  const catalogEntry = (value: string) => catalog.find((entry) => entry.value === value);
  const statusLabel = catalogEntry(status)?.label ?? status;
  const savedEndDate = project.endDate ?? project.startDate;
  const statusChange: StatusChangeProps | null =
    destinations.length === 0
      ? null
      : {
          projectId: project.id,
          projectNumber: project.number,
          projectLabel: `${project.number} ${project.name}`,
          from: status,
          destinations: destinations.map((destination) => ({
            value: destination.to,
            label: catalogEntry(destination.to)?.label ?? destination.to,
            description: catalogEntry(destination.to)?.description ?? null,
            blockedReason: destination.blockedReason,
          })),
          startDate: project.startDate,
          endDate: project.endDate,
          settleOn: project.endDate ? addDays(project.endDate, 1) : null,
          endDateBeforeToday: savedEndDate !== null && savedEndDate < kstToday(new Date()),
          currentRevisionSeq: revision.seq,
          currentRevisionApproved: revision.approved,
          periodRights,
        };

  // 04-11(D-81): 종료일이 지난 수주중 — 상태를 바꿀 수 있으면 글자만, 없으면 담당 팀장 이름을 붙인다.
  // 이름은 쓰일 때만 조회한다(엔지 리뷰 A §1 P2) — 04-30: 표가 비었을 때(EMPTY `· 담당 PM {이름}`)도.
  const endDatePassed = isEndDatePassed({ status, endDate: project.endDate, todayKst: kstToday(new Date()) });
  const needsLeadName = endDatePassed && statusChange === null;
  const responsibles =
    needsLeadName || lines.length === 0 ? await projectResponsibles(session.viewer, project) : null;
  const teamLeadName = needsLeadName ? (responsibles?.teamLeadName ?? null) : null;
  const endDateNote = !endDatePassed ? null : teamLeadName ? `종료일 지남 · 팀장 ${teamLeadName}` : "종료일 지남";

  return (
    <>
    <QuoteLedger
      projectId={project.id}
      status={status}
      period={{ startDate: project.startDate, endDate: project.endDate, rights: periodRights, todayKst }}
      preEstimate={{ value: project.preEstimate ?? null, canEdit: canEditPreEstimate }}
      canSave={canSave}
      projectName={project.name}
      subtitle={`${project.number} · 상세 견적 ${revision.seq}차`}
      statusSinceText={`${statusLabel} ${statusSince}`}
      statusLabel={statusLabel}
      statusTagKind={PROJECT_STATUS_TAG_KIND[status]}
      statusChange={statusChange}
      newRevision={newRevision}
      customerApproval={customerApproval}
      approvedSeq={approvedSeq}
      endDateNote={endDateNote}
      revisionId={revision.id}
      initialLines={lines}
      vendors={references?.vendors ?? []}
      subcategories={references?.subcategories ?? []}
      structural={structural}
      newLineCells={newLineCells}
      adjustmentStructural={adjustmentStructural}
      adjustmentLineCells={adjustmentLineCells}
      outOfQuoteLineCells={outOfQuoteLineCells}
      lineCap={lineCap}
      lockReason={quoteLockReason({ status: project.status, approvedSeq })}
      emptyState={quoteTableEmptyState({
        status: project.status,
        canAddLine: structural.insert,
        canAdjust: adjustmentStructural.insert,
        periodRights,
        pmName: responsibles?.pmName ?? null,
      })}
      revenue={revenue}
      canWriteContract={canWrite}
      canWriteEntries={canWriteEntries}
      usdDefaultFxRate={usdDefaultFxRate}
      contractVatKrw={revenue.contract?.vatKrw ?? 0}
      contractTotalKrw={revenue.contract?.totalKrw ?? 0}
    />
    {/* 04-24(S3 섹션 순서 ③ → ④) — 매출(원장 안 마지막 섹션) 뒤에 차수 섹션, 그 아래 이전 차수 읽기 섹션. */}
    <RevisionSection
      projectId={project.id}
      summaries={revisionSummaries}
      references={{ subcategories: references?.subcategories ?? [], vendors: references?.vendors ?? [] }}
    />
    </>
  );
}
