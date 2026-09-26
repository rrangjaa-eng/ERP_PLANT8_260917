"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// WR-06(02-REVIEW.md) — 로그아웃 세 경로(내 계정 버튼·상단 바 메뉴·「더보기」 시트)가
// 전부 try/catch 없이 signOut()을 await했다. 실패하면 상단 바·시트는 호출 전에 표면을
// 닫아 버려 아무 반응이 없고(사용자는 로그아웃됐다고 믿지만 세션은 살아 있다),
// 내 계정 버튼은 pending이 영구히 걸려 다시 시도할 수 없었다.
//
// 셋이 같은 실패를 같은 방식으로 다루도록 판정을 여기 한 곳에 둔다.
// D-10: 로그아웃은 현재 기기 세션만 끝낸다("모든 기기에서 로그아웃"은 없음).
export const LOGOUT_FAILED = "로그아웃 실패 · 다시 시도";

export type UseLogout = {
  logout: () => Promise<void>;
  pending: boolean;
  error: string | null;
};

// onSuccess는 성공한 뒤에만 불린다 — 메뉴·시트를 닫는 자리다. 실패했는데 닫으면
// 사용자가 실패 문구를 못 본다.
export function useLogout(onSuccess?: () => void): UseLogout {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? LOGOUT_FAILED);
      onSuccess?.();
      // 성공 시 pending을 내리지 않는다 — 곧 화면이 바뀌므로 버튼이 잠깐 되살아나
      // 두 번 눌리는 것을 막는다.
      router.push("/login");
    } catch {
      // 원인 문구는 보이지 않는다 — 사용자가 할 수 있는 다음 행동은 재시도 하나뿐이고,
      // better-auth의 영문 메시지를 그대로 노출하지 않는다(§8 카피 규칙).
      setPending(false);
      setError(LOGOUT_FAILED);
    }
  }

  return { logout, pending, error };
}
