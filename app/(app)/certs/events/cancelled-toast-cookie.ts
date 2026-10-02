import { env } from "@/lib/env";

// 04.3-17 검토 X4(사용자 결정 PR #88 5934173511) — 「신청 취소」 뒤 목록 토스트의 행사 이름은 주소(`?cancelled=`)가 아니라
// 액션이 남기는 한 번 쓰는 httpOnly 쿠키로 넘긴다. 목록이 서버에서 읽어 한 번 띄우고, 착지 화면이 곧바로 지운다.
// 주소에 적은 글자는 토스트가 되지 않는다(내용 위장 경로 없음).
export const CANCELLED_TOAST_COOKIE = "erp_cert_cancelled";

export const cancelledToastCookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: env.BETTER_AUTH_URL?.startsWith("https://") === true,
  path: "/certs/events",
  maxAge: 60,
} as const;
