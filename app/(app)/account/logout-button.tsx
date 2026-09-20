"use client";

import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { useLogout } from "@/ui/logout/use-logout";

// SYSTEM.md §7-1: 이 화면의 2차 버튼(1차는 비밀번호 변경 하나뿐).
// WR-06: 실패하면 pending을 풀고 문구를 보인다 — 예전에는 버튼이 「로그아웃…」으로
// 영구히 잠겨 새로고침 말고는 다시 시도할 방법이 없었다.
export function LogoutButton() {
  const { logout, pending, error } = useLogout();

  return (
    <>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        variant="secondary"
        pending={pending}
        onClick={() => {
          void logout();
        }}
      >
        로그아웃
      </Button>
    </>
  );
}
