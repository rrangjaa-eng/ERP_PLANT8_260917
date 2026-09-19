"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button/Button";

// SYSTEM.md §7-1: 이 화면의 2차 버튼(1차는 비밀번호 변경 하나뿐).
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    // D-10: 로그아웃은 현재 기기 세션만 끝낸다("모든 기기에서 로그아웃"은 없음).
    setPending(true);
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={() => {
        void handleClick();
      }}
    >
      로그아웃
    </Button>
  );
}
