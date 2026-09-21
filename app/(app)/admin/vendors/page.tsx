import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listVendors, listVendorFieldDefinitions } from "@/domain/vendors";
import { listCodeItems } from "@/domain/code-tables";
import { maskTail4 } from "@/lib/crypto";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { VendorForm, VendorHiddenToggle, VendorDeleteButton } from "./vendor-form";
import { AccountNumberCell } from "./account-number";
import styles from "./vendors.module.css";

const REVEAL_INFO_ITEM = "vendor.account_number_unmasked";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// 목록 화면의 필터 상태(숨김 포함 여부)를 유지한 채 이동하는 링크를 만든다 —
// 「수정」에서 폼으로 들어갈 때도, 폼의 「취소」에서 목록으로 돌아올 때도 같은
// 필터를 쓴다.
function vendorsHref(includeHidden: boolean, editId?: string): string {
  const params = new URLSearchParams();
  if (includeHidden) params.set("includeHidden", "1");
  if (editId) params.set("editId", editId);
  const query = params.toString();
  return query ? `/admin/vendors?${query}#vendor-form` : "/admin/vendors";
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeHidden?: string; editId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.vendors", "view"))) notFound();

  const { includeHidden: includeHiddenParam, editId } = await searchParams;
  const includeHidden = includeHiddenParam === "1";

  const [vendors, canWrite, canReveal, evidenceTypes, fieldDefs, canArchive] = await Promise.all([
    listVendors(session.viewer, { includeHidden }),
    can(session.viewer, "admin.vendors", "write"),
    visible(session.viewer, REVEAL_INFO_ITEM),
    listCodeItems(session.viewer, "evidence_type"),
    listVendorFieldDefinitions(session.viewer),
    can(session.viewer, "admin.archive", "write"),
  ]);

  const evidenceTypeLabelByValue = new Map(evidenceTypes.map((item) => [item.value, item.label]));
  // editId가 가리키는 행이 지금 이 조회 결과(숨김 포함 여부에 따라 달라짐)에
  // 없으면(예: 숨김 거래처를 「숨김 포함」 꺼진 채로 가리키는 오래된 링크)
  // 조용히 등록 모드로 돌아간다 — 존재하지 않는 대상을 오류로 다루지 않는다.
  const editingVendor = editId ? (vendors.find((vendor) => vendor.id === editId) ?? null) : null;
  const cancelHref = vendorsHref(includeHidden);

  return (
    <>
      <PageHeader title="거래처" />

      {/* 쓰기 권한이 없는 계급에는 등록 폼 자체를 렌더하지 않는다 —
          "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md). */}
      {canWrite ? (
        <VendorForm
          key={editingVendor?.id ?? "create"}
          evidenceTypes={evidenceTypes.map((item) => ({ value: item.value, label: item.label }))}
          fieldDefs={fieldDefs}
          editing={editingVendor}
          cancelHref={cancelHref}
        />
      ) : null}

      <div className={styles.filterRow}>
        <a href={includeHidden ? "?includeHidden=0" : "?includeHidden=1"} className={styles.toggle}>
          {includeHidden ? "숨김 제외" : "숨김 포함"}
        </a>
      </div>

      {vendors.length === 0 ? (
        <ListEmpty message="등록된 거래처가 없습니다" action={{ label: "거래처 등록", href: "#vendor-form" }} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">사업자 번호</th>
              <th scope="col">기본 증빙 종류</th>
              <th scope="col">계좌</th>
              <th scope="col">상태</th>
              {canWrite || canArchive ? <th scope="col">동작</th> : null}
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor.id}>
                <td>{vendor.name}</td>
                <td>{vendor.businessNo ?? "—"}</td>
                <td>
                  {vendor.defaultEvidenceType
                    ? (evidenceTypeLabelByValue.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType)
                    : "—"}
                </td>
                <td>
                  <AccountNumberCell
                    vendorId={vendor.id}
                    masked={maskTail4(vendor.accountNumberLast4)}
                    canReveal={canReveal}
                  />
                </td>
                <td>
                  {vendor.archivedAt ? (
                    <StatusTag kind="muted" variant="text">
                      보관됨
                    </StatusTag>
                  ) : vendor.hidden ? (
                    <StatusTag kind="muted" variant="text">
                      숨김
                    </StatusTag>
                  ) : null}
                </td>
                {canWrite || canArchive ? (
                  <td>
                    {vendor.archivedAt ? null : (
                      <>
                        {canWrite ? (
                          <Link href={vendorsHref(includeHidden, vendor.id)} className={styles.toggle}>
                            수정
                          </Link>
                        ) : null}
                        {canWrite ? <VendorHiddenToggle id={vendor.id} hidden={vendor.hidden} /> : null}
                        {canArchive ? <VendorDeleteButton id={vendor.id} name={vendor.name} /> : null}
                      </>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
