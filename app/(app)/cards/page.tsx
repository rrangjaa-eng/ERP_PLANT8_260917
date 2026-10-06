import { requireSession } from "@/lib/viewer";
import { seoulToday } from "@/lib/dates";
import { cardUsageFormOptions, listCardUsages } from "@/domain/corp-card-usages";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { CardUsageList, type CardUsageListRowView } from "./card-usage-list";
import { CardUsageForm } from "./card-usage-form";

// 06-05(EXP-07 · UI-SPEC S8 · S9 · C12): 법인카드 사용 목록 = 원장. 한 건 등록은 `?new=1` 옆 패널(페이지 폼 없음).
// WR-07: 인증 검사를 이 페이지가 직접 한다(레이아웃에 기대지 않는다).
export const dynamic = "force-dynamic";

const NEW_HREF = "/cards?new=1";
const CARD_RECEIPT = "card_receipt";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { viewer, user } = await requireSession();
  const { new: newParam } = await searchParams;
  const today = seoulToday();
  const month = today.slice(0, 7);

  const [list, options] = await Promise.all([listCardUsages(viewer, { month }, today), cardUsageFormOptions(viewer, today)]);
  const cards = options.cards.flatMap((card) => (card.id && card.label ? [{ id: card.id, label: card.label }] : []));
  const rows: CardUsageListRowView[] = list.rows.flatMap((row) =>
    row.id && row.cardId && row.cardLabel && row.usedOn && row.linkKind
      ? [
          {
            id: row.id,
            cardId: row.cardId,
            cardLabel: row.cardLabel,
            usedOn: row.usedOn,
            merchantName: row.merchantName ?? null,
            linkKind: row.linkKind,
            teamName: row.teamName ?? null,
            registeredByName: row.registeredByName ?? "—",
            totalKrw: row.totalKrw ?? null,
            supplyKrw: row.supplyKrw ?? null,
          },
        ]
      : [],
  );

  const panel =
    newParam === "1" && cards.length > 0 ? (
      <SidePanel title="카드 사용 등록" closeHref="/cards">
        <CardUsageForm
          cards={cards}
          evidenceTypes={options.evidenceTypes}
          teamName={options.teamName}
          userName={user.name}
          today={today}
          defaults={{
            usedOn: today,
            corpCardId: cards.length === 1 ? (cards[0]?.id ?? null) : null,
            linkKind: null,
            evidenceTypeCode: options.evidenceTypes.some((option) => option.value === CARD_RECEIPT) ? CARD_RECEIPT : null,
          }}
        />
      </SidePanel>
    ) : null;

  return (
    <ListScreen
      title="카드 사용"
      primaryAction={cards.length > 0 ? { label: "카드 사용 등록", href: NEW_HREF } : undefined}
      empty={
        rows.length > 0 ? undefined : cards.length === 0 ? (
          <ListEmpty message="쓸 수 있는 법인카드가 없습니다 · 카드 등록은 관리자" />
        ) : (
          <ListEmpty message="이번 달 카드 사용이 없습니다" action={{ label: "카드 사용 등록", href: NEW_HREF }} />
        )
      }
      panel={panel}
    >
      <CardUsageList rows={rows} />
    </ListScreen>
  );
}
