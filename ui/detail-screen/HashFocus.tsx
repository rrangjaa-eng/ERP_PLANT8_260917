"use client";

import { useEffect } from "react";

// 07.1-19 PC4(SP-71-5): 주소 해시가 이 섹션 제목 id와 같으면 그 제목(tabindex -1)으로 포커스한다 — 화면 사이 해시 링크로 도착해도
// 키보드 자리가 BODY가 아니라 도착 섹션에 있다. 아무것도 그리지 않는 조각이라 `DetailScreen`(서버 호환)은 `headingId`가 있을 때만 이것을 둔다.
// 앱 라우터 이동은 주소 갱신이 커밋 뒤일 수 있어 마운트 때 한 번과 `hashchange` 때 다시 본다. 비교는 문자열 같음 하나 —
// 해시로 선택자를 만들지 않고, 그 id 요소가 없으면 아무것도 하지 않는다(T-07.1-19-04).
export function HashFocus({ targetId }: { targetId: string }) {
  useEffect(() => {
    function focusIfHashMatches() {
      if (window.location.hash !== `#${targetId}`) return;
      document.getElementById(targetId)?.focus();
    }
    // 마운트 때는 같은 커밋의 다른 effect(작성 폼의 첫 포커스 등)가 먼저 끝난 뒤에 선다 — 해시로 온 도착이 첫 포커스 규칙에 덮이지 않는다.
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) focusIfHashMatches();
    });
    window.addEventListener("hashchange", focusIfHashMatches);
    return () => {
      mounted = false;
      window.removeEventListener("hashchange", focusIfHashMatches);
    };
  }, [targetId]);
  return null;
}
