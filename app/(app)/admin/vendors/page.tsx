import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listVendors, listVendorFieldDefinitions } from "@/domain/vendors";
import { listCodeItems } from "@/domain/code-tables";
import { VENDOR_KIND_LABELS, parseVendorSide, servesSide, type VendorSide } from "@/domain/vendors/kind";
import { maskTail4 } from "@/lib/mask-tail4";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { VendorForm, VendorHiddenToggle, VendorDeleteButton } from "./vendor-form";
import { AccountNumberCell } from "./account-number";
import styles from "./vendors.module.css";

const REVEAL_INFO_ITEM = "vendor.account_number_unmasked";

// 261006-biv D-5: 갈래 걸러보기 링크 — 「전체」는 kind 없음.
const KIND_FILTERS: { label: string; kind: VendorSide | null }[] = [
  { label: "전체", kind: null },
  { label: VENDOR_KIND_LABELS.client, kind: "client" },
  { label: VENDOR_KIND_LABELS.supplier, kind: "supplier" },
];

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// 목록 화면의 필터 상태(숨김 포함 여부)를 유지한 채 이동하는 링크를 만든다 —
// 「수정」·「거래처 등록」에서 패널로 들어갈 때도, 패널을 닫고 목록으로
// 돌아올 때도 같은 필터를 쓴다. `isNew`는 등록 모드(D-39: 추가·수정은 별도
// 화면 — vendors가 이미 쓰던 ?editId= 토글 방식을 등록에도 그대로 확장한다,
// DECISIONS.md 2026-09-21 참고).
function vendorsHref(includeHidden: boolean, opts?: { editId?: string; isNew?: boolean; kind?: VendorSide | null }): string {
  const params = new URLSearchParams();
  if (includeHidden) params.set("includeHidden", "1");
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.editId) params.set("editId", opts.editId);
  if (opts?.isNew) params.set("new", "1");
  const query = params.toString();
  return query ? `/admin/vendors?${query}` : "/admin/vendors";
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeHidden?: string; editId?: string; new?: string; kind?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.vendors", "view"))) notFound();

  const { includeHidden: includeHiddenParam, editId, new: newParam, kind: kindParam } = await searchParams;
  const includeHidden = includeHiddenParam === "1";
  // 261006-biv D-5: ?kind=client · supplier만 걸러보기(둘 다 포함), 그 밖의 값은 전체.
  const kindFilter = parseVendorSide(kindParam);

  const [vendors, canWrite, canReveal, evidenceTypes, fieldDefs, canArchive] = await Promise.all([
    listVendors(session.viewer, { includeHidden }),
    can(session.viewer, "admin.vendors", "write"),
    visible(session.viewer, REVEAL_INFO_ITEM),
    listCodeItems(session.viewer, "evidence_type"),
    listVendorFieldDefinitions(session.viewer),
    can(session.viewer, "admin.archive", "write"),
  ]);

  const evidenceTypeLabelByValue = new Map(evidenceTypes.map((item) => [item.value, item.label]));
  // 「동작」 열의 유무 — 머리글·행·접힌 줄의 colSpan이 같은 조건을 쓴다.
  const hasActions = canWrite || canArchive;
  // editId가 가리키는 행이 지금 이 조회 결과(숨김 포함 여부에 따라 달라짐)에
  // 없으면(예: 숨김 거래처를 「숨김 포함」 꺼진 채로 가리키는 오래된 링크)
  // 조용히 등록 모드로 돌아간다 — 존재하지 않는 대상을 오류로 다루지 않는다.
  // 보관된 거래처는 수정 모드로 열지 않는다 — 목록에서 「수정」 링크를 감추는
  // 것만으로는 ?editId=<보관된 id>를 직접 여는 경로를 못 막는다(DOM 감사
  // 실측). 도메인의 ArchivedVendorError가 저장을 막지만, 고칠 수 있는 폼을
  // 보여 놓고 제출한 뒤에 실패시키면 안 된다. 법인카드 화면과 같은 조건이다.
  const editingVendor = editId
    ? (vendors.find((vendor) => vendor.id === editId && vendor.archivedAt === null) ?? null)
    : null;
  const cancelHref = vendorsHref(includeHidden, { kind: kindFilter });
  // 표 행만 거른다 — editingVendor는 거르지 않은 목록에서 찾는다(걸러보기 중 갈래를 바꿔 저장해도 패널이 그대로).
  const shownVendors = kindFilter ? vendors.filter((vendor) => servesSide(vendor.kind, kindFilter)) : vendors;
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입(쿼리
  // 없음)에는 폼이 없다. editId가 가리키는 행이 있으면 수정 모드로 그 자체가
  // 열림 신호다(?new=1과 무관하게).
  const showCreateForm = newParam === "1";
  const showForm = editingVendor !== null || showCreateForm;

  // DR5 A — 빈 목록(등록된 거래처가 하나도 없음)이면 머리 1차를 그리지 않고 빈 화면의 「거래처 등록」 하나가 등록을 맡는다.
  const primaryAction =
    canWrite && vendors.length > 0 ? { label: "거래처 등록", href: vendorsHref(includeHidden, { isNew: true, kind: kindFilter }) } : undefined;

  return (
    <ListScreen
      title="거래처"
      primaryAction={primaryAction}
      filters={
        <>
          <nav aria-label="구분" className={styles.kindNav}>
            {KIND_FILTERS.map(({ label, kind }) => (
              <Link
                key={label}
                href={vendorsHref(includeHidden, { kind })}
                scroll={false}
                className={styles.toggle}
                aria-current={kind === kindFilter ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link href={vendorsHref(!includeHidden, { kind: kindFilter })} scroll={false} className={styles.toggle}>
            {includeHidden ? "숨김 제외" : "숨김 포함"}
          </Link>
        </>
      }
      panel={
        // 쓰기 권한이 없는 계급에는 등록 폼 자체를 렌더하지 않는다 — "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md).
        canWrite && showForm ? (
          <SidePanel key={editingVendor?.id ?? "new"} title={editingVendor ? "거래처 수정" : "거래처 등록"} closeHref={cancelHref}>
            <VendorForm
              evidenceTypes={evidenceTypes.map((item) => ({ value: item.value, label: item.label, description: item.description }))}
              fieldDefs={fieldDefs}
              editing={editingVendor}
              newKind={kindFilter ?? undefined}
            />
          </SidePanel>
        ) : null
      }
    >
      {vendors.length === 0 ? (
        <ListEmpty
          message="등록된 거래처가 없습니다"
          action={{ label: "거래처 등록", href: vendorsHref(includeHidden, { isNew: true, kind: kindFilter }) }}
        />
      ) : shownVendors.length === 0 ? (
        <ListEmpty message="조건에 맞는 건이 없습니다" action={{ label: "필터 지우기", href: vendorsHref(includeHidden) }} />
      ) : (
        <StaticTable
          caption="거래처"
          columns={[
            { key: "name", header: "이름", priority: "p1" },
            { key: "kind", header: "구분", priority: "p2" },
            { key: "businessNo", header: "사업자 번호", priority: "p2" },
            { key: "evidenceType", header: "기본 증빙 종류", priority: "p2" },
            { key: "account", header: "계좌", priority: "p1", align: "right" },
            { key: "status", header: "상태", priority: "p2" },
            ...(hasActions ? [{ key: "actions", header: "동작", priority: "p1" as const }] : []),
          ]}
          rows={shownVendors.map((vendor) => {
            const evidenceType = vendor.defaultEvidenceType
              ? (evidenceTypeLabelByValue.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType)
              : null;
            return {
              key: vendor.id,
              cells: [
                vendor.name,
                VENDOR_KIND_LABELS[vendor.kind],
                vendor.businessNo ?? "—",
                evidenceType ?? "—",
                <AccountNumberCell
                  key="account"
                  vendorId={vendor.id}
                  masked={maskTail4(vendor.accountNumberLast4)}
                  canReveal={canReveal}
                />,
                <Fragment key="status">
                  {vendor.archivedAt ? (
                    <StatusTag status="보관됨" variant="text" />
                  ) : vendor.hidden ? (
                    <StatusTag status="숨김" variant="text" />
                  ) : "—"}
                </Fragment>,
                ...(hasActions
                  ? [
                      vendor.archivedAt ? null : (
                        <RowActions key="actions">
                          {canWrite ? (
                            <RowAction href={vendorsHref(includeHidden, { editId: vendor.id, kind: kindFilter })}>수정</RowAction>
                          ) : null}
                          {canWrite ? <VendorHiddenToggle id={vendor.id} hidden={vendor.hidden} /> : null}
                          {canArchive ? <VendorDeleteButton id={vendor.id} name={vendor.name} /> : null}
                        </RowActions>
                      ),
                    ]
                  : []),
              ],
            };
          })}
        />
      )}
    </ListScreen>
  );
}
