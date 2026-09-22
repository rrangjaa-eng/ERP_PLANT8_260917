import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listProjects } from "@/domain/projects";
import { listProjectFormReferences } from "@/domain/projects/references";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ProjectForm } from "./project-form";
import styles from "./projects.module.css";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// SYSTEM.md §6-1 목록 화면 = 원장. Phase 4 트레이서는 기본 렌더만 만든다 —
// 월별 그룹·상태 필터·「더 보기」·집계 합계는 04-05.
// WR-07: 인증 검사를 이 페이지가 직접 한다(02-01 DECISIONS.md 선례).
function projectsHref(opts?: { isNew?: boolean }): string {
  return opts?.isNew ? "/projects?new=1#project-form" : "/projects";
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "projects", "view"))) notFound();

  const { new: newParam } = await searchParams;
  const showCreateForm = newParam === "1";

  const [projects, canWrite] = await Promise.all([
    listProjects(session.viewer),
    can(session.viewer, "projects", "write"),
  ]);

  const references = canWrite && showCreateForm ? await listProjectFormReferences(session.viewer) : null;

  return (
    <>
      <PageHeader title="프로젝트" subtitle="진행 중인 프로젝트 원장" />

      {/* §6-1 D-39: 폼이 열려 있으면(?new=1) 아래 필터 줄의 1차 버튼을
          렌더하지 않는다 — 한 화면에 1차는 하나다. */}
      {canWrite && showCreateForm && references ? (
        <ProjectForm
          clients={references.clients}
          teams={references.teams}
          pmUsers={references.pmUsers}
          cancelHref={projectsHref()}
        />
      ) : null}

      <div className={styles.filterRow}>
        {/* projects.length === 0이면 ListEmpty가 이미 같은 「프로젝트 등록」
            행동을 준다 — vendors.tsx 선례(vendors.length > 0)와 같은 이유로
            여기서도 중복 CTA를 만들지 않는다. */}
        {canWrite && !showCreateForm && projects.length > 0 ? (
          <Link href={projectsHref({ isNew: true })} className={styles.toggle}>
            프로젝트 등록
          </Link>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <ListEmpty
          message="등록된 프로젝트가 없습니다"
          action={{ label: "프로젝트 등록", href: projectsHref({ isNew: true }) }}
        />
      ) : (
        <table className={styles.table}>
          <caption className="sr-only">프로젝트</caption>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">프로젝트명</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((item) => (
              <tr key={item.id}>
                <td>{item.number}</td>
                <td>
                  <Link href={`/projects/${item.id}`} className={styles.link}>
                    {item.name}
                  </Link>
                </td>
                <td>
                  <StatusTag kind="muted" variant="text">
                    {item.status}
                  </StatusTag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
