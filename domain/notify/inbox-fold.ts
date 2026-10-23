// 알림함 접힘 판정(N26 · 07 개정 3) — 같은 KST 날짜 안에서 같은 등록부 종류(`kindLabel`)가 5건 이상이면 한 줄로 접는다.
// `kindLabel`이 없는 행(등록부 밖 즉시 경로 — 확인증 알림 등)은 접지 않는다. 불러온 행 안에서만 센다(더 보기로 늘면 다시 센다).
import { toKstDate } from "@/domain/holidays/business-day";

export const FOLD_MIN_COUNT = 5;

export type FoldableRow = { id: string; createdAt: string; kindLabel?: string };

export type InboxItem<Row extends FoldableRow> =
  | { type: "row"; row: Row }
  // key = 날짜 + 종류 — 펼침 상태를 이 키로 들고 있어 행이 늘어도 유지된다.
  | { type: "fold"; key: string; label: string; rows: Row[] };

export function foldKey(date: string, label: string): string {
  return `${date}|${label}`;
}

export function foldInbox<Row extends FoldableRow>(rows: readonly Row[]): InboxItem<Row>[] {
  const counts = new Map<string, number>();
  const keyOf = (row: Row): string | null => (row.kindLabel ? foldKey(toKstDate(new Date(row.createdAt)), row.kindLabel) : null);
  for (const row of rows) {
    const key = keyOf(row);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const folds = new Map<string, Row[]>();
  const items: InboxItem<Row>[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null || (counts.get(key) ?? 0) < FOLD_MIN_COUNT) {
      items.push({ type: "row", row });
      continue;
    }
    const members = folds.get(key);
    if (members) {
      members.push(row);
      continue;
    }
    const created: Row[] = [row];
    folds.set(key, created);
    items.push({ type: "fold", key, label: row.kindLabel ?? "", rows: created });
  }
  return items;
}
