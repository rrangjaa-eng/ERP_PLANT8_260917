import { kstDayStart } from "@/lib/kst-date";

// 04.3-10(N9 a · N15 a · E8 b) — 수령자 링크의 열림 · 마감(순수). 링크는 당첨일 00:00 KST에 열리고, 마감은
// max(당첨일 00:00 KST, QR 생성 시각) + 설정 cert.link.expire_hours시간이다 — QR을 며칠 앞서 만들어도 행사 전에
// 닫히지 않고, 당첨일이 지난 뒤 만들어도 곧바로 닫히지 않는다. generateQr와 I′2 계산 줄이 같은 함수를 부른다.
export function certLinkExpiresAt(wonOn: string, now: Date, expireHours: number): Date {
  const start = Math.max(kstDayStart(wonOn).getTime(), now.getTime());
  return new Date(start + expireHours * 60 * 60 * 1000);
}
