// 04-47(DR-16) — 합계 행 오른쪽 한 줄 조립. RED 골격(구현 전).
export type FooterNoticeTone = "danger" | "warning" | "muted";
export type FooterNoticeItem = { tone: FooterNoticeTone; text: string; paste?: "head" | "piece" | "reach" };
export type FooterNoticePiece = { tone: FooterNoticeTone | "success"; text: string };

export function composeFooterNotice(_items: readonly FooterNoticeItem[], _opts: { successText?: string | null } = {}): FooterNoticePiece[] {
  return [];
}
