import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { findProject } from "@/domain/projects";
import { listProjectFormReferences } from "@/domain/projects/references";
import { getCurrentQuoteRevision, listQuoteLines } from "@/domain/quotes/lines";
import { listRevenue } from "@/domain/revenue";
import { recentFxRate } from "@/domain/money/currency";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { listProjectStatusCatalog, statusDestinations } from "@/domain/projects/status";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import { addDays, kstToday } from "@/lib/kst-date";
import { PROJECT_STATUS_TAG_KIND } from "../status-display";
import { QuoteLedger } from "./quote-table";
import type { StatusChangeProps } from "./status-change";

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

  const [canWrite, canWriteEntries, revision] = await Promise.all([
    can(session.viewer, "projects", "write"),
    can(session.viewer, "projects.revenue", "write"),
    getCurrentQuoteRevision(session.viewer, project.id),
  ]);

  // D-53: 프로젝트를 등록하면 상세 견적 1차가 항상 함께 생긴다 — 없으면
  // 데이터 결함이라 목록/등록 경로 밖에서 도달할 수 없는 상태로 다룬다.
  if (!revision) notFound();

  const status = PROJECT_STATUSES.find((value) => value === project.status);
  if (!status) notFound();

  // (가) 셀 편집 가능성은 서버가 판정해 보낸다 — 화면은 project.status
  // 문자열을 다시 해석하지 않고 이 판정 결과(boolean)만 받는다.
  const gateDecision = await gate(project, "project.line-edit", { status: project.status });
  // 금액을 볼 수 없으면 표를 편집하지 않는다 — 서버도 저장을 거부한다(saveQuoteLines).
  const editable = canWrite && gateDecision.allowed && (await visible(session.viewer, "quote.amount"));

  const [lines, references, revenue, usdDefaultFxRate, destinations, catalog] = await Promise.all([
    listQuoteLines(session.viewer, revision.id),
    canWrite ? listProjectFormReferences(session.viewer) : Promise.resolve(null),
    listRevenue(session.viewer, project.id),
    recentFxRate("USD"),
    statusDestinations(session.viewer, project),
    listProjectStatusCatalog(session.viewer),
  ]);

  // 04-21(S3·S7) — 갈 곳이 없으면 「상태 바꾸기」를 렌더하지 않는다(비활성 버튼이 아니다).
  // 화면은 상태 문자열로 권한을 추론하지 않고 서버의 갈 곳 목록만 본다.
  const catalogEntry = (value: string) => catalog.find((entry) => entry.value === value);
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
        };

  return (
    <QuoteLedger
      projectId={project.id}
      projectName={project.name}
      projectNumber={project.number}
      revisionSeq={revision.seq}
      statusLabel={catalogEntry(status)?.label ?? status}
      statusTagKind={PROJECT_STATUS_TAG_KIND[status]}
      statusChange={statusChange}
      revisionId={revision.id}
      initialLines={lines}
      vendors={references?.vendors ?? []}
      subcategories={references?.subcategories ?? []}
      editable={editable}
      revenue={revenue}
      canWriteContract={canWrite}
      canWriteEntries={canWriteEntries}
      usdDefaultFxRate={usdDefaultFxRate}
      contractVatKrw={revenue.contract?.vatKrw ?? 0}
      contractTotalKrw={revenue.contract?.totalKrw ?? 0}
    />
  );
}
