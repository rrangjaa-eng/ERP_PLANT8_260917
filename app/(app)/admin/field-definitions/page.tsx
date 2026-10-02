import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listFieldDefinitionsForAdmin, type FieldDefinitionAdminDto } from "@/domain/custom-fields/admin";
import { nextSortOrder } from "@/domain/custom-fields/targets";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 3차 클래스를 직접 쓴다(pnl 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import { FieldDefinitionForm } from "./field-definition-form";
import styles from "./field-definitions.module.css";

// 04.5-01 인증 가드 · 권한 게이트 · 제목 · `?new=1` 등록 폼, 04.5-08 목록 표(UI-SPEC 화면 1 · E1).
export const dynamic = "force-dynamic";

const LIST_HREF = "/admin/field-definitions";

const TYPE_LABELS: Record<FieldDefinitionAdminDto["type"], string> = {
  text: "텍스트",
  number: "숫자",
  date: "날짜",
  select: "선택",
};

// 선택지 열: 타입이 선택일 때만 활성 선택지의 콤마 목록, 그 외 「—」.
function optionsText(def: FieldDefinitionAdminDto): string {
  return def.type === "select" && def.options.length > 0 ? def.options.join(", ") : "—";
}

export default async function FieldDefinitionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.field-definitions", "view"))) notFound();

  const { new: newParam } = await searchParams;
  const [canWrite, canViewVisibility, allDefs] = await Promise.all([
    can(session.viewer, "admin.field-definitions", "write"),
    can(session.viewer, "admin.visibility", "view"),
    listFieldDefinitionsForAdmin(session.viewer),
  ]);
  // 쓰기 권한이 없으면 `?new=1`로 직접 와도 폼을 렌더하지 않는다.
  const showForm = canWrite && newParam === "1";
  // 보관 행은 이 목록에서 뺀다(보관 포함 필터는 04). 정렬은 listFieldDefinitions 순서(정렬 순서, 내부 키) 그대로다.
  const defs = allDefs.filter((def) => !def.archived);

  return (
    <>
      <PageHeader title="화면 항목" subtitle="거래처" />
      {showForm ? (
        <FieldDefinitionForm
          cancelHref={LIST_HREF}
          defaultSortOrder={nextSortOrder(defs.map((def) => def.sortOrder))}
          canViewVisibility={canViewVisibility}
        />
      ) : null}
      {canWrite && !showForm && defs.length > 0 ? (
        <div className={styles.filterRow}>
          <Link href={`${LIST_HREF}?new=1`} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
            화면 항목 추가
          </Link>
        </div>
      ) : null}
      {defs.length === 0 ? (
        <ListEmpty
          message="등록된 화면 항목이 없습니다"
          action={canWrite && !showForm ? { label: "화면 항목 추가", href: `${LIST_HREF}?new=1` } : undefined}
        />
      ) : (
        <table className={styles.table}>
          <caption className="sr-only">화면 항목</caption>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col" className={styles.p2}>타입</th>
              <th scope="col" className={styles.p2}>필수</th>
              <th scope="col">정렬</th>
              <th scope="col" className={styles.p2}>선택지</th>
              <th scope="col" className={styles.p2}>상태</th>
              <th scope="col">동작</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((def) => {
              // §7-3 폰 전략 — P2(타입 · 필수 · 선택지)는 행 아래 접힌 줄 하나로 들어간다.
              const folded = [
                TYPE_LABELS[def.type],
                def.required ? "필수" : null,
                def.type === "select" && def.options.length > 0 ? optionsText(def) : null,
              ].filter((value): value is string => !!value);
              return (
                <Fragment key={def.id}>
                  <tr>
                    <th scope="row">{def.label}</th>
                    <td className={styles.p2}>{TYPE_LABELS[def.type]}</td>
                    <td className={styles.p2}>{def.required ? "필수" : "—"}</td>
                    <td className={styles.number}>{def.sortOrder}</td>
                    <td className={styles.p2}>{optionsText(def)}</td>
                    <td className={styles.p2}>—</td>
                    <td />
                  </tr>
                  <tr className={styles.collapsedRow}>
                    <td colSpan={7} className={styles.collapsedCell}>
                      {folded.join(" · ")}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
