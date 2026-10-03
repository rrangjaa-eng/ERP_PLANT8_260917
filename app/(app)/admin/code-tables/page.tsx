import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCodeItems, CODE_TABLES } from "@/domain/code-tables";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowActions } from "@/ui/row-actions/RowActions";
import { Num } from "@/ui/num/Num";
import {
  CodeItemForm,
  CodeItemLabelInput,
  CodeItemDescriptionInput,
  CodeItemActiveToggle,
  CodeItemDeleteButton,
} from "./code-item-form";
import { PcOnly } from "../pc-only";
import { EvidenceTypeFields } from "./evidence-type-fields";
import styles from "./code-tables.module.css";

// 03-06: 증빙 종류 코드표(evidence_type)가 두 번째 표로 늘었다 — 표 위
// 전환 링크로 고른다. 기본값은 기존 계약 그대로 project_status다(회귀 없음).
// quick 261002-3mx — 목록은 domain(CODE_TABLES) 한 곳이다(createCodeItem의 서버 판정과 같은 목록).
const TABLE_OPTIONS = CODE_TABLES;
const DEFAULT_TABLE_KEY = "project_status";
const EVIDENCE_TYPE_TABLE_KEY = "evidence_type";

// D-18과 같은 결: 캐시·별도 저장 없음 — 화면 로드마다 목록을 다시 조회한다.
export const dynamic = "force-dynamic";

// 목록 화면의 필터 상태(코드표 선택·숨김 포함 여부)를 유지한 채 등록 패널을
// 열고 닫는 링크를 만든다 — vendors의 ?editId= 토글과 같은 결(§6-1, D-39,
// DECISIONS.md 2026-09-21).
function codeTablesHref(tableKey: string, includeInactive: boolean, opts?: { isNew?: boolean }): string {
  const params = new URLSearchParams({ tableKey });
  if (includeInactive) params.set("includeInactive", "1");
  if (opts?.isNew) params.set("new", "1");
  return `/admin/code-tables?${params.toString()}`;
}

// app/(app)/admin/system-status/page.tsx의 세 게이트 순서를 그대로 복제하고
// 세 번째 줄만 코드표 메뉴 보기 판정으로 바꾼다(D-36 계약: 화면 코드에 계급
// 이름 분기가 없다 — can()이 유일한 판정 지점). 이 세 줄과 기존 열 구성은
// 표가 늘어도 바꾸지 않는다.
export default async function CodeTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string; tableKey?: string; new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.code-tables", "view"))) notFound();

  const { includeInactive: includeInactiveParam, tableKey: tableKeyParam, new: newParam } = await searchParams;
  const includeInactive = includeInactiveParam === "1";
  const tableKey = TABLE_OPTIONS.some((option) => option.key === tableKeyParam) ? tableKeyParam! : DEFAULT_TABLE_KEY;
  const isEvidenceType = tableKey === EVIDENCE_TYPE_TABLE_KEY;
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입에는
  // 폼이 없다.
  const showForm = newParam === "1";

  const [items, canWrite, canArchive] = await Promise.all([
    listCodeItems(session.viewer, tableKey, { includeInactive }),
    can(session.viewer, "admin.code-tables", "write"),
    can(session.viewer, "admin.archive", "write"),
  ]);
  const currentLabel = TABLE_OPTIONS.find((option) => option.key === tableKey)?.label ?? tableKey;
  // 「동작」 열의 유무 — 머리글과 행의 칸이 같은 조건을 쓴다(칸을 비우면서 머리글만 남기면 빈 칸이 생긴다).
  const hasActions = canWrite || canArchive;
  const cancelHref = codeTablesHref(tableKey, includeInactive);
  const newHref = codeTablesHref(tableKey, includeInactive, { isNew: true });

  return (
    <ListScreen
      title="코드표"
      // DR5 A — 빈 목록이면 머리 1차를 그리지 않고 빈 화면의 「코드 추가」 하나가 등록을 맡는다.
      primaryAction={canWrite && items.length > 0 ? { label: "코드 추가", href: newHref, phoneHidden: true } : undefined}
      filters={
        <>
          {/* 고른 표 이름은 부제 대신 현재 링크 표시(색·굵기·밑줄)와 표 caption이 맡는다. */}
          <nav aria-label="코드표 선택" className={styles.tableNav}>
            {TABLE_OPTIONS.map((option) => (
              <Link
                key={option.key}
                href={`?tableKey=${option.key}`}
                scroll={false}
                className={styles.toggle}
                aria-current={option.key === tableKey ? "page" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          <Link
            href={`?tableKey=${tableKey}&${includeInactive ? "includeInactive=0" : "includeInactive=1"}`}
            scroll={false}
            className={styles.toggle}
          >
            {includeInactive ? "숨김 제외" : "숨김 포함"}
          </Link>
        </>
      }
      panel={
        // 쓰기 권한이 없는 계급에는 등록·편집 수단 자체를 렌더하지 않는다 —
        // "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md).
        canWrite && showForm ? (
          <SidePanel title="코드 추가" closeHref={cancelHref}>
            <CodeItemForm tableKey={tableKey} />
          </SidePanel>
        ) : null
      }
    >
      {items.length === 0 ? (
        <ListEmpty
          message="등록된 코드가 없습니다"
          action={canWrite ? { label: "코드 추가", href: newHref, phoneHidden: true } : undefined}
        />
      ) : (
        <StaticTable
          caption={`코드표 · ${currentLabel}`}
          // 폰: 이름 · 상태가 P1, 설명은 이름 아래 접힌 줄(P2), 값 · 정렬 · 동작은 숨김(P3). 폰은 읽기만이라 편집 행동(동작)도 폰에서 숨는다
          // (사용자 결정 2026-10-03 14:57 KST 카드 「폰은 읽기만」 — 04.6-15 Q4 A 「동작 보이게」를 대체).
          columns={[
            { key: "value", header: "값", priority: "p3" },
            { key: "label", header: "이름", priority: "p1" },
            { key: "description", header: "설명", priority: "p2" },
            { key: "sortOrder", header: "정렬", priority: "p3", align: "right" },
            { key: "status", header: "상태", priority: "p1" },
            ...(hasActions ? [{ key: "actions", header: "동작", priority: "p3" as const }] : []),
          ]}
          rows={items.map((item) => ({
            key: item.id,
            cells: [
              item.value,
              // MAST-04 「수정」 — 보관된 항목은 도메인이 거부하므로 입력칸 대신 글자로 보인다(계급 화면과 같은 결).
              item.archivedAt || !canWrite ? item.label : <CodeItemLabelInput key={item.id} id={item.id} label={item.label} />,
              // 04-10(D-93) — 설명. 보관·쓰기 불가는 이름 칸과 같은 결로 글자만(「—」는 값 없음, S14). 입력은 StaticTable P2 칸이라
              // PC 열과 폰 접힌 줄에 한 번씩 그려지고 보이는 쪽은 폭마다 하나다.
              item.archivedAt || !canWrite ? (
                <span className={styles.readOnlyText}>{item.description ?? "—"}</span>
              ) : (
                <CodeItemDescriptionInput id={item.id} label={item.label} description={item.description} />
              ),
              <Num key="sortOrder" value={item.sortOrder} unit="count" />,
              <Fragment key="status">
                {item.archivedAt ? (
                  <StatusTag status="보관됨" variant="text" />
                ) : item.active === false ? (
                  <StatusTag status="비활성" variant="text" />
                ) : "—"}
              </Fragment>,
              ...(hasActions
                ? [
                    item.archivedAt ? null : (
                      <PcOnly key="actions">
                        <RowActions>
                          {canWrite ? <CodeItemActiveToggle id={item.id} active={item.active} /> : null}
                          {canArchive ? <CodeItemDeleteButton id={item.id} label={item.label} /> : null}
                        </RowActions>
                      </PcOnly>
                    ),
                  ]
                : []),
            ],
            // 증빙 종류 표의 세금 규칙 편집 줄 — 행 아래 전폭 줄(패널이 아니다).
            detail: isEvidenceType && canWrite ? <EvidenceTypeFields itemId={item.id} initialValue={item.taxRule} /> : undefined,
          }))}
        />
      )}
    </ListScreen>
  );
}
