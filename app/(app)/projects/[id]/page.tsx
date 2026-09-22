import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { findProject } from "@/domain/projects";
import { listProjectFormReferences } from "@/domain/projects/references";
import { getCurrentQuoteRevision, listQuoteLines } from "@/domain/quotes/lines";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { QuoteLedger } from "./quote-table";

// SYSTEM.md §6-2 상세 화면 — 이 리포의 첫 목록/상세 분리 화면. 네 숫자 줄
// (PNL-01)·매출 섹션·차수 섹션의 마크업은 이 플랜에 없다(04-02/04-06/04-09).
// WR-07: 인증 검사를 이 페이지가 직접 한다.
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

  const [canWrite, revision] = await Promise.all([
    can(session.viewer, "projects", "write"),
    getCurrentQuoteRevision(session.viewer, project.id),
  ]);

  // D-53: 프로젝트를 등록하면 상세 견적 1차가 항상 함께 생긴다 — 없으면
  // 데이터 결함이라 목록/등록 경로 밖에서 도달할 수 없는 상태로 다룬다.
  if (!revision) notFound();

  // (가) 셀 편집 가능성은 서버가 판정해 보낸다 — 화면은 project.status
  // 문자열을 다시 해석하지 않고 이 판정 결과(boolean)만 받는다.
  const gateDecision = await gate(project, "project.completed-lock", { status: project.status });
  const editable = canWrite && gateDecision.allowed;

  const [lines, references] = await Promise.all([
    listQuoteLines(session.viewer, revision.id),
    canWrite ? listProjectFormReferences(session.viewer) : Promise.resolve(null),
  ]);

  return (
    <QuoteLedger
      projectName={project.name}
      projectNumber={project.number}
      revisionSeq={revision.seq}
      statusLabel={STATUS_LABELS[project.status] ?? project.status}
      revisionId={revision.id}
      initialLines={lines}
      vendors={references?.vendors ?? []}
      subcategories={references?.subcategories ?? []}
      editable={editable}
    />
  );
}
