import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { PageHeader } from "@/ui/page-header/PageHeader";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 3차 클래스를 직접 쓴다(pnl 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import { FieldDefinitionForm } from "./field-definition-form";

// 04.5-01: 인증 가드 · 권한 게이트 · 제목 · `?new=1` 등록 폼. 목록 표 · 결과 줄 · 칸 오류는 08.
export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/field-definitions";

export default async function FieldDefinitionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.field-definitions", "view"))) notFound();

  const { new: newParam } = await searchParams;
  const canWrite = await can(session.viewer, "admin.field-definitions", "write");
  // 쓰기 권한이 없으면 `?new=1`로 직접 와도 폼을 렌더하지 않는다.
  const showForm = canWrite && newParam === "1";

  return (
    <>
      <PageHeader title="화면 항목" subtitle="거래처" />
      {showForm ? <FieldDefinitionForm cancelHref={LIST_HREF} /> : null}
      {canWrite && !showForm ? (
        <div>
          <Link href={`${LIST_HREF}?new=1`} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
            화면 항목 추가
          </Link>
        </div>
      ) : null}
    </>
  );
}
