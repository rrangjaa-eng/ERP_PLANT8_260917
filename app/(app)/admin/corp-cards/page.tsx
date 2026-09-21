import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listCorpCards } from "@/domain/corp-cards";
import { listPeople } from "@/domain/people";
import { listOrgUnits, listTeams } from "@/domain/org";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { CardForm, CorpCardActiveToggle, CorpCardDeleteButton } from "./card-form";
import styles from "./corp-cards.module.css";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

export default async function CorpCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.corp-cards", "view"))) notFound();

  const { includeInactive: includeInactiveParam } = await searchParams;
  const includeInactive = includeInactiveParam === "1";

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

  return (
    <>
      <PageHeader title="법인카드" />

      {/* 쓰기 권한이 없는 계급에는 등록 폼 자체를 렌더하지 않는다 —
          "이유 있는 비활성" 대신 "버튼 자체가 없음"(03-UI-SPEC.md). */}
      {canWrite ? <CardForm holders={people.map((p) => ({ id: p.id, name: p.name }))} teams={teamOptions} /> : null}

      <div className={styles.filterRow}>
        <a
          href={includeInactive ? "?includeInactive=0" : "?includeInactive=1"}
          className={styles.toggle}
        >
          {includeInactive ? "숨김 제외" : "숨김 포함"}
        </a>
      </div>

      {cards.length === 0 ? (
        <ListEmpty
          message="등록된 법인카드가 없습니다"
          action={{ label: "법인카드 등록", href: "#corp-card-form" }}
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
