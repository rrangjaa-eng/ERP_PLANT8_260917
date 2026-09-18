"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();

  async function handleClick() {
    // D-10: 로그아웃은 현재 기기 세션만 끝낸다("모든 기기에서 로그아웃"은 없음).
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={() => {
        void handleClick();
      }}
    >
      로그아웃
    </button>
  );
}
