"use client";

import Link from "next/link";
import { buttonLinkClassName } from "@/ui/button/Button";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import styles from "./events.module.css";

// 04.3-04 Task 3 ④(D-10) — 1024 미만(좁은 PC · 폰)에는 만들기가 없다. 폭 판정은 Phase 4 useEditableWidth() 하나다
// (CSS 미디어 쿼리로 두 번째 판정을 만들지 않는다). 서버 스냅숏은 참이라 좁은 화면은 수화 뒤 거둔다.
const CREATE_HREF = "/certs/events?new=1";

/** 표 위 행동 줄의 1차 「행사 만들기」 — 1024 이상에서만. */
export function CreateEntryPrimary() {
  const wide = useEditableWidth();
  if (!wide) return null;
  return (
    <div className={styles.actionRow}>
      <Link href={CREATE_HREF} className={buttonLinkClassName("primary")}>
        행사 만들기
      </Link>
    </div>
  );
}

/** I1 EMPTY — 1024 이상에서만 3차 「행사 만들기」, 미만은 앞 문장만. */
export function EventsEmpty({ canCreate }: { canCreate: boolean }) {
  const wide = useEditableWidth();
  return (
    <ListEmpty
      message="확인증 행사가 없습니다"
      action={canCreate && wide ? { label: "행사 만들기", href: CREATE_HREF } : undefined}
    />
  );
}
