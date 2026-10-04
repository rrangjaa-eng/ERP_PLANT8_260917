import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCorpCards } from "@/domain/corp-cards";
import { listPeople } from "@/domain/people";
import { listOrgUnits, listTeams } from "@/domain/org";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import {
  CardForm,
  CardOwnerForm,
  CorpCardActiveToggle,
  CorpCardDeleteButton,
} from "./card-form";
import styles from "./corp-cards.module.css";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// vendors의 ?editId= 토글과 같은 결(§6-1, D-39, DECISIONS.md 2026-09-21) —
// 패널을 열고 닫는 링크를 필터 상태(숨김 포함 여부)를 유지한 채 만든다.
function corpCardsHref(
  includeInactive: boolean,
  opts?: { isNew?: boolean; editId?: string },
): string {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "1");
  if (opts?.isNew) params.set("new", "1");
  if (opts?.editId) params.set("editId", opts.editId);
  const query = params.toString();
  return query ? `/admin/corp-cards?${query}` : "/admin/corp-cards";
}

export default async function CorpCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string; new?: string; editId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.corp-cards", "view"))) notFound();

  const { includeInactive: includeInactiveParam, new: newParam, editId } = await searchParams;
  const includeInactive = includeInactiveParam === "1";
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입에는
  // 폼이 없다.
  const showCreateForm = newParam === "1";

  const [cards, canWrite, people, orgUnits, teams, canArchive] = await Promise.all([
    listCorpCards(session.viewer, { includeInactive }),
    can(session.viewer, "admin.corp-cards", "write"),
    listPeople(session.viewer),
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
    can(session.viewer, "admin.archive", "write"),
  ]);

  const orgUnitNameById = new Map(orgUnits.map((org) => [org.id, org.name]));
  // 이름 조회 표는 보관된 행까지 담는다 — 이미 그 사람·팀이 소유한 기존 카드의
  // 목록 칸이 "—"로 비지 않게 해야 한다.
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const holderNameById = new Map(people.map((person) => [person.id, person.name]));

  // /cso T-03-55: 선택 후보에서는 보관된 사람·팀을 뺀다. listPeople·listTeams는
  // scopeFor의 includeArchived를 따르므로 보관함 보기 권한이 있는 계급에게는
  // 퇴사자·해체된 팀이 활성 항목과 구분 없이 보였다. 도메인이
  // ArchivedCardOwnerError로 막지만, 고를 수 있게 두면 고른 뒤에야 실패한다.
  const holderOptions = people
    .filter((person) => person.archivedAt === null)
    .map((person) => ({ id: person.id, name: person.name }));
  const teamOptions = teams
    .filter((team) => team.archivedAt === null)
    .map((team) => ({
      id: team.id,
      name: team.name,
      orgUnitName: orgUnitNameById.get(team.orgUnitId) ?? "",
    }));

  // vendors와 같은 결: editId가 가리키는 행이 지금 조회 결과에 없으면(숨김
  // 필터 때문이거나 오래된 링크) 조용히 목록으로 돌아간다. 보관된 카드는
  // 여기서도 걸러지고, 도메인이 한 겹 더 막는다(ArchivedCorpCardError).
  const editingCard = editId
    ? (cards.find((card) => card.id === editId && card.archivedAt === null) ?? null)
    : null;
  const showForm = editingCard !== null || showCreateForm;
  const cancelHref = corpCardsHref(includeInactive);
  // 「동작」 열의 유무 — 머리글과 행의 칸이 같은 조건을 쓴다.
  const hasActions = canWrite || canArchive;

  // DR5 A — 빈 목록(등록된 카드가 하나도 없음)이면 머리 1차를 그리지 않고 빈 화면의 「법인카드 등록」 하나가 등록을 맡는다.
  const primaryAction =
    canWrite && cards.length > 0 ? { label: "법인카드 등록", href: corpCardsHref(includeInactive, { isNew: true }) } : undefined;

  // 수정 모드가 이긴다 — ?new=1&editId=를 같이 주면 폼 둘이 함께 뜨지 않게 패널 하나에 하나만 담는다.
  const panelBody =
    canWrite && showForm ? (
      editingCard === null ? (
        <CardForm holders={holderOptions} teams={teamOptions} />
      ) : (
        <CardOwnerForm
          card={{
            id: editingCard.id,
            label: editingCard.label,
            kind: editingCard.kind,
            holderUserId: editingCard.holderUserId ?? null,
            teamId: editingCard.teamId ?? null,
          }}
          holders={holderOptions}
          teams={teamOptions}
        />
      )
    ) : null;

  return (
    <ListScreen
      title="법인카드"
      primaryAction={primaryAction}
      filters={
        <Link href={includeInactive ? "?includeInactive=0" : "?includeInactive=1"} scroll={false} className={styles.toggle}>
          {includeInactive ? "숨김 제외" : "숨김 포함"}
        </Link>
      }
      panel={
        // 쓰기 권한이 없는 계급에는 패널 자체를 렌더하지 않는다 — "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md).
        panelBody ? (
          <SidePanel
            key={editingCard?.id ?? "new"}
            title={editingCard ? "법인카드 수정" : "법인카드 등록"}
            closeHref={cancelHref}
          >
            {panelBody}
          </SidePanel>
        ) : null
      }
    >
      {cards.length === 0 ? (
        <ListEmpty
          message="등록된 법인카드가 없습니다"
          action={{ label: "법인카드 등록", href: corpCardsHref(includeInactive, { isNew: true }) }}
        />
      ) : (
        <StaticTable
          caption="법인카드"
          // 폰: 별칭 · 뒤 4자리 · 동작이 P1, 나머지는 접힌 줄(P2) — 동작 칸 폭을 늘려 삭제 확인 문구가 거래처 수준 줄 수다(TODOS 173).
          // 상세 화면이 없는 목록이라 P3로 숨기지 않는다(SYSTEM §7-3).
          columns={[
            { key: "issuer", header: "발급사", priority: "p2" },
            { key: "last4", header: "뒤 4자리", priority: "p1", align: "right" },
            { key: "label", header: "별칭", priority: "p1" },
            { key: "kind", header: "종류", priority: "p2" },
            { key: "owner", header: "소유", priority: "p2" },
            { key: "status", header: "상태", priority: "p2" },
            ...(hasActions ? [{ key: "actions", header: "동작", priority: "p1" as const }] : []),
          ]}
          rows={cards.map((card) => ({
            key: card.id,
            cells: [
              card.issuer,
              card.numberLast4,
              card.label,
              card.kind === "personal" ? "개인" : "팀",
              card.kind === "personal"
                ? (holderNameById.get(card.holderUserId ?? "") ?? "—")
                : (teamNameById.get(card.teamId ?? "") ?? "—"),
              <Fragment key="status">
                {card.archivedAt ? (
                  <StatusTag status="보관됨" variant="text" />
                ) : card.active === false ? (
                  <StatusTag status="비활성" variant="text" />
                ) : "—"}
              </Fragment>,
              ...(hasActions
                ? [
                    card.archivedAt ? null : (
                      <RowActions key="actions">
                        {canWrite ? (
                          <RowAction href={corpCardsHref(includeInactive, { editId: card.id })}>수정</RowAction>
                        ) : null}
                        {canWrite ? <CorpCardActiveToggle id={card.id} active={card.active} /> : null}
                        {canArchive ? <CorpCardDeleteButton id={card.id} label={card.label} /> : null}
                      </RowActions>
                    ),
                  ]
                : []),
            ],
          }))}
        />
      )}
    </ListScreen>
  );
}
