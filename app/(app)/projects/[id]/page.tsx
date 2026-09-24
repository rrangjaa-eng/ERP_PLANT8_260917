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
import { QuoteLedger } from "./quote-table";

// SYSTEM.md §6-2 상세 화면 — 이 리포의 첫 목록/상세 분리 화면. 네 숫자 줄
// (PNL-01)·차수 섹션의 마크업은 이 플랜에 없다(04-06/04-09). 매출 섹션은
// 04-02가 더한다. WR-07: 인증 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  bidding: "수주중",
  in_progress: "진행",
  settled: "완료(정산)",
  lost: "미수주",
};

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

  // (가) 셀 편집 가능성은 서버가 판정해 보낸다 — 화면은 project.status
  // 문자열을 다시 해석하지 않고 이 판정 결과(boolean)만 받는다.
  const gateDecision = await gate(project, "project.line-edit", { status: project.status });
  // 금액을 볼 수 없으면 표를 편집하지 않는다 — 서버도 저장을 거부한다(saveQuoteLines).
  const editable = canWrite && gateDecision.allowed && (await visible(session.viewer, "quote.amount"));

  const [lines, references, revenue, usdDefaultFxRate] = await Promise.all([
    listQuoteLines(session.viewer, revision.id),
    canWrite ? listProjectFormReferences(session.viewer) : Promise.resolve(null),
    listRevenue(session.viewer, project.id),
    recentFxRate("USD"),
  ]);

  return (
    <QuoteLedger
      projectId={project.id}
      projectName={project.name}
      projectNumber={project.number}
      revisionSeq={revision.seq}
      statusLabel={STATUS_LABELS[project.status] ?? project.status}
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
