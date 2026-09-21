import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCorpCards } from "@/domain/corp-cards";
import { listPeople } from "@/domain/people";
import { listOrgUnits, listTeams } from "@/domain/org";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
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
// 등록 폼을 열고 닫는 링크를 필터 상태(숨김 포함 여부)를 유지한 채 만든다.
function corpCardsHref(
  includeInactive: boolean,
  opts?: { isNew?: boolean; editId?: string },
): string {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "1");
  if (opts?.isNew) params.set("new", "1");
  if (opts?.editId) params.set("editId", opts.editId);
  const query = params.toString();
  if (!query) return "/admin/corp-cards";
  const anchor = opts?.editId ? "#corp-card-owner-form" : "#corp-card-form";
  return `/admin/corp-cards?${query}${anchor}`;
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
  const teamOptions = teams.map((team) => ({
    id: team.id,
    name: team.name,
    orgUnitName: orgUnitNameById.get(team.orgUnitId) ?? "",
  }));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const holderNameById = new Map(people.map((person) => [person.id, person.name]));

  // vendors와 같은 결: editId가 가리키는 행이 지금 조회 결과에 없으면(숨김
  // 필터 때문이거나 오래된 링크) 조용히 목록으로 돌아간다. 보관된 카드는
  // 여기서도 걸러지고, 도메인이 한 겹 더 막는다(ArchivedCorpCardError).
  const editingCard = editId
    ? (cards.find((card) => card.id === editId && card.archivedAt === null) ?? null)
    : null;
  const showForm = editingCard !== null || showCreateForm;

  return (
    <>
      <PageHeader title="법인카드" />

      {/* 쓰기 권한이 없는 계급에는 등록 폼 자체를 렌더하지 않는다 —
          "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md). */}
      {canWrite && editingCard ? (
        <CardOwnerForm
          key={editingCard.id}
          card={{
            id: editingCard.id,
            label: editingCard.label,
            kind: editingCard.kind,
            holderUserId: editingCard.holderUserId ?? null,
            teamId: editingCard.teamId ?? null,
          }}
          holders={people.map((p) => ({ id: p.id, name: p.name }))}
          teams={teamOptions}
          cancelHref={corpCardsHref(includeInactive)}
        />
      ) : null}

      {/* 수정 모드가 이긴다 — ?new=1&editId=를 같이 주면 폼 2개와 1차 버튼
          2개가 함께 떠서 §7-1을 어겼다(주소를 직접 칠 때만 도달). 거래처는
          폼 하나에 editing prop을 넘겨 이 상태 자체가 불가능하다. */}
      {canWrite && showCreateForm && !editingCard ? (
        <CardForm
          holders={people.map((p) => ({ id: p.id, name: p.name }))}
          teams={teamOptions}
          cancelHref={corpCardsHref(includeInactive)}
        />
      ) : null}

      <div className={styles.filterRow}>
        <a
          href={includeInactive ? "?includeInactive=0" : "?includeInactive=1"}
          className={styles.toggle}
        >
          {includeInactive ? "숨김 제외" : "숨김 포함"}
        </a>
        {/* §6-1 「새 지출결의」와 같은 자리 — 목록 머리글의 등록 행동. */}
        {canWrite && !showForm && cards.length > 0 ? (
          <Link href={corpCardsHref(includeInactive, { isNew: true })} className={styles.toggle}>
            법인카드 등록
          </Link>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <ListEmpty
          message="등록된 법인카드가 없습니다"
          action={{ label: "법인카드 등록", href: corpCardsHref(includeInactive, { isNew: true }) }}
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">발급사</th>
              <th scope="col">뒤 4자리</th>
              <th scope="col">별칭</th>
              <th scope="col">종류</th>
              <th scope="col">소유</th>
              <th scope="col">상태</th>
              {canWrite || canArchive ? <th scope="col">동작</th> : null}
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id}>
                <td>{card.issuer}</td>
                <td className={styles.last4}>{card.numberLast4}</td>
                <td>{card.label}</td>
                <td>{card.kind === "personal" ? "개인" : "팀"}</td>
                <td>
                  {card.kind === "personal"
                    ? (holderNameById.get(card.holderUserId ?? "") ?? "—")
                    : (teamNameById.get(card.teamId ?? "") ?? "—")}
                </td>
                <td>
                  {card.archivedAt ? (
                    <StatusTag kind="muted" variant="text">
                      보관됨
                    </StatusTag>
                  ) : card.active === false ? (
                    <StatusTag kind="muted" variant="text">
                      비활성
                    </StatusTag>
                  ) : null}
                </td>
                {canWrite || canArchive ? (
                  <td>
                    {card.archivedAt ? null : (
                      <>
                        {canWrite ? (
                          <Link
                            href={corpCardsHref(includeInactive, { editId: card.id })}
                            className={styles.toggle}
                          >
                            수정
                          </Link>
                        ) : null}
                        {canWrite ? <CorpCardActiveToggle id={card.id} active={card.active} /> : null}
                        {canArchive ? <CorpCardDeleteButton id={card.id} label={card.label} /> : null}
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
