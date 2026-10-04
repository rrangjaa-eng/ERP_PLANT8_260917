"use client";

import { useLinkStatus } from "next/link";

// 패널을 여는 링크 안에 두는 「진행 중」 표시(04.6-04 D6 · Q11) — `next/link` 자식으로만 쓴다.
// 누른 직후 패널이 뜨기 전까지 Button의 pending 표기와 같은 글자(라벨 뒤 「…」 · sr-only 「처리 중」)를 보인다.
// 새 모양을 만들지 않는다. prefetch된 경로는 pending 단계가 건너뛰어질 수 있다(use-link-status.md).
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-busy="true">
      <span aria-hidden="true">…</span>
      <span className="sr-only">처리 중</span>
    </span>
  );
}
