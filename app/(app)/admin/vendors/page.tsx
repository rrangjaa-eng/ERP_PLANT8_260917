import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listVendors, listVendorFieldDefinitions } from "@/domain/vendors";
import { listCodeItems } from "@/domain/code-tables";
import { VENDOR_KIND_LABELS, parseVendorSide, type VendorSide } from "@/domain/vendors/kind";
import { maskTail4 } from "@/lib/mask-tail4";
import { getSettingValue } from "@/domain/settings/registry";
import { PAYMENT_TERM_DAYS } from "@/domain/settings/keys";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { VendorForm, VendorHiddenToggle, VendorDeleteButton, VendorPanel } from "./vendor-form";
import { AccountNumberCell } from "./account-number";
import { revealVendorAccountNumberAction } from "./actions";
import { VendorExportButton } from "./export-button";
import { VendorSearch } from "./vendor-search";
import { AccountHistory } from "./account-history";
import { VendorDocuments } from "./vendor-documents";
import { listAccountChanges } from "@/domain/vendors/account-changes";
import { listVendorContacts } from "@/domain/vendors/contacts";
import { listVendorDocuments } from "@/domain/vendors/documents";
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
// 07-20 V2: 검색어(`q`)도 같은 방식으로 지킨다 — 「필터 지우기」만 갈래 · 검색어를 함께 비운다.
function vendorsHref(includeHidden: boolean, opts?: { editId?: string; isNew?: boolean; kind?: VendorSide | null; q?: string }): string {
  const params = new URLSearchParams();
  if (includeHidden) params.set("includeHidden", "1");
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.editId) params.set("editId", opts.editId);
  if (opts?.isNew) params.set("new", "1");
  const query = params.toString();
  return query ? `/admin/vendors?${query}` : "/admin/vendors";
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeHidden?: string; editId?: string; new?: string; kind?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.vendors", "view"))) notFound();

  const { includeHidden: includeHiddenParam, editId, new: newParam, kind: kindParam, q: qParam } = await searchParams;
  const includeHidden = includeHiddenParam === "1";
  // 261006-biv D-5: ?kind=client · supplier만 걸러보기(둘 다 포함), 그 밖의 값은 전체.
  const kindFilter = parseVendorSide(kindParam);
  // 07-20 V2: 검색어 — 이름 · 사업자 번호 숫자 포함(서버가 거른다).
  const query = (qParam ?? "").trim();
  const filtered = query !== "" || kindFilter !== null;

  const [vendors, filteredVendors, canWrite, canReveal, evidenceTypes, fieldDefs, canArchive, canEditAccount, paymentTermDefault] = await Promise.all([
    listVendors(session.viewer, { includeHidden }),
    filtered ? listVendors(session.viewer, { includeHidden, kind: kindFilter, q: query }) : null,
    can(session.viewer, "admin.vendors", "write"),
    visible(session.viewer, REVEAL_INFO_ITEM),
    listCodeItems(session.viewer, "evidence_type"),
    listVendorFieldDefinitions(session.viewer),
    can(session.viewer, "admin.archive", "write"),
    // 07-20 R8(D-739): 기존 거래처 계좌 세 칸은 「계좌 · 서류 수정」 보유자만 입력 칸 — 아니면 읽기 줄(서버도 거부).
    can(session.viewer, "vendors.account", "write"),
    // 07-20 N6: 지급 기한 빈 칸 placeholder = 회사 기본 일수(설정 payment.term_days).
    getSettingValue(PAYMENT_TERM_DAYS),
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
  // 07-23 SC-17 ⑦⑨⑩: 수정 패널의 담당자(정한 순서) · 서류(계좌 · 서류 권한자는 두 자리, 아니면 개수) · 계좌 변경 기록(최신 위 · 뒤 4자리만).
  const [accountHistory, contacts, documents] = editingVendor
    ? await Promise.all([
        listAccountChanges(session.viewer, editingVendor.id),
        listVendorContacts(session.viewer, editingVendor.id),
        listVendorDocuments(session.viewer, editingVendor.id),
      ])
    : [[], [], null];
  const cancelHref = vendorsHref(includeHidden, { kind: kindFilter, q: query });
  // 표 행만 거른다 — editingVendor는 거르지 않은 목록에서 찾는다(걸러보기 · 검색 중 갈래 · 이름을 바꿔 저장해도 패널이 그대로).
  const shownVendors = filteredVendors ?? vendors;
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입(쿼리
  // 없음)에는 폼이 없다. editId가 가리키는 행이 있으면 수정 모드로 그 자체가
  // 열림 신호다(?new=1과 무관하게).
  const showCreateForm = newParam === "1";
  const showForm = editingVendor !== null || showCreateForm;

  // DR5 A — 빈 목록(등록된 거래처가 하나도 없음)이면 머리 1차를 그리지 않고 빈 화면의 「거래처 등록」 하나가 등록을 맡는다.
  const primaryAction =
    canWrite && vendors.length > 0 ? { label: "거래처 등록", href: vendorsHref(includeHidden, { isNew: true, kind: kindFilter, q: query }) } : undefined;

  return (
    <ListScreen
      title="거래처"
      primaryAction={primaryAction}
      filters={
        <>
          <VendorSearch query={query} includeHidden={includeHidden} kind={kindFilter} clearHref={vendorsHref(includeHidden, { kind: kindFilter })} />
          <nav aria-label="갈래" className={styles.kindNav}>
            {KIND_FILTERS.map(({ label, kind }) => (
              <Link
                key={label}
                href={vendorsHref(includeHidden, { kind, q: query })}
                scroll={false}
                className={styles.toggle}
                aria-current={kind === kindFilter ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link href={vendorsHref(!includeHidden, { kind: kindFilter, q: query })} scroll={false} className={styles.toggle}>
            {includeHidden ? "숨김 제외" : "숨김 포함"}
          </Link>
          {/* 07-20 V1 · K12 · D-736: 필터 줄 끝 2차 — 편집 폭에서만(폰 · 태블릿 세로는 렌더 안 함), 결과가 상한을 넘으면 비활성 + 이유 한 줄. */}
          {shownVendors.length > 0 ? (
            <VendorExportButton filter={{ includeHidden, kind: kindFilter, q: query }} count={shownVendors.length} />
          ) : null}
        </>
      }
      panel={
        // 쓰기 권한이 없는 계급에는 등록 폼 자체를 렌더하지 않는다 — "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md).
        // 07-20 V3: VendorForm key가 version을 담는다 — 새로 불러오기 · 다른 사람 저장 뒤 폼을 새로 마운트해 서버 값으로 다시 연다(내 입력 폐기).
        canWrite && showForm ? (
          <VendorPanel key={editingVendor?.id ?? "new"} editId={editingVendor?.id ?? null} title={editingVendor ? "거래처 수정" : "거래처 등록"} closeHref={cancelHref}>
            <VendorForm
              key={editingVendor ? `${editingVendor.id}-${editingVendor.version}` : "new"}
              evidenceTypes={evidenceTypes.map((item) => ({ value: item.value, label: item.label, description: item.description }))}
              fieldDefs={fieldDefs}
              editing={editingVendor}
              newKind={kindFilter ?? undefined}
              canEditAccount={canEditAccount}
              paymentTermDefault={paymentTermDefault}
              contacts={contacts.map((item) => ({ id: item.id ?? "", name: item.name ?? "", phone: item.phone ?? null, email: item.email ?? null }))}
            >
              {editingVendor && documents ? <VendorDocuments vendorId={editingVendor.id} documents={documents} /> : null}
              <AccountHistory
                items={accountHistory.map((item) => ({
                  id: item.id ?? "",
                  changedAt: item.changedAt ?? "—",
                  changedByName: item.changedByName ?? "—",
                  beforeLast4: item.beforeLast4 ?? null,
                  afterLast4: item.afterLast4 ?? null,
                }))}
              />
            </VendorForm>
          </VendorPanel>
        ) : null
      }
    >
      {vendors.length === 0 ? (
        <ListEmpty
          message="등록된 거래처가 없습니다"
          action={{ label: "거래처 등록", href: vendorsHref(includeHidden, { isNew: true, kind: kindFilter }) }}
        />
      ) : shownVendors.length === 0 ? (
        <ListEmpty message="조건에 맞는 거래처가 없습니다" action={{ label: "필터 지우기", href: vendorsHref(includeHidden) }} />
      ) : (
        <StaticTable
          caption="거래처"
          columns={[
            // 07-20 SC-16: 폰 P1 = 이름 · 갈래 · 상태(+ 행 행동), 사업자 번호 · 기본 증빙 종류 · 계좌는 접힘 줄(P2).
            { key: "name", header: "이름", priority: "p1" },
            { key: "kind", header: "갈래", priority: "p1" },
            { key: "businessNo", header: "사업자 번호", priority: "p2" },
            { key: "evidenceType", header: "기본 증빙 종류", priority: "p2" },
            { key: "account", header: "계좌", priority: "p2", align: "right" },
            { key: "status", header: "상태", priority: "p1" },
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
                  id={vendor.id}
                  masked={maskTail4(vendor.accountNumberLast4)}
                  canReveal={canReveal}
                  revealAction={revealVendorAccountNumberAction}
                />,
                <Fragment key="status">
                  {vendor.archivedAt ? (
                    <StatusTag status="보관됨" variant="text" />
                  ) : vendor.hidden ? (
                    <StatusTag status="숨김" variant="text" />
                  ) : vendor.confirmedAt === null ? (
                    // 07-23 SC-16 · V4: 한 값 `숨김 > 확인 전 > —`.
                    <StatusTag status="확인 전" variant="text" />
                  ) : "—"}
                </Fragment>,
                ...(hasActions
                  ? [
                      vendor.archivedAt ? null : (
                        <RowActions key="actions">
                          {canWrite ? (
                            <RowAction href={vendorsHref(includeHidden, { editId: vendor.id, kind: kindFilter, q: query })}>수정</RowAction>
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
