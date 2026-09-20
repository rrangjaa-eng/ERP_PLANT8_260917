import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listVendors, listVendorFieldDefinitions } from "@/domain/vendors";
import { listCodeItems } from "@/domain/code-tables";
import { maskTail4 } from "@/lib/crypto";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { VendorForm, VendorHiddenToggle } from "./vendor-form";
import { AccountNumberCell } from "./account-number";
import styles from "./vendors.module.css";

const REVEAL_INFO_ITEM = "vendor.account_number_unmasked";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeHidden?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.vendors", "view"))) notFound();

  const { includeHidden: includeHiddenParam } = await searchParams;
  const includeHidden = includeHiddenParam === "1";

  const [vendors, canWrite, canReveal, evidenceTypes, fieldDefs] = await Promise.all([
    listVendors(session.viewer, { includeHidden }),
    can(session.viewer, "admin.vendors", "write"),
    visible(session.viewer, REVEAL_INFO_ITEM),
    listCodeItems(session.viewer, "evidence_type"),
    listVendorFieldDefinitions(session.viewer),
  ]);

  const evidenceTypeLabelByValue = new Map(evidenceTypes.map((item) => [item.value, item.label]));

  return (
    <>
      <PageHeader title="거래처" />

      {/* 쓰기 권한이 없는 계급에는 등록 폼 자체를 렌더하지 않는다 —
          "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md). */}
      {canWrite ? (
        <VendorForm
          evidenceTypes={evidenceTypes.map((item) => ({ value: item.value, label: item.label }))}
          fieldDefs={fieldDefs}
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
              {canWrite ? <th scope="col">동작</th> : null}
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
                  {vendor.hidden ? (
                    <StatusTag kind="muted" variant="text">
                      숨김
                    </StatusTag>
                  ) : null}
                </td>
                {canWrite ? (
                  <td>
                    <VendorHiddenToggle id={vendor.id} hidden={vendor.hidden} />
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
