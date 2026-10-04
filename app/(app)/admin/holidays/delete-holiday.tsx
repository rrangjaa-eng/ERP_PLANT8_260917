"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { deleteHolidayAction } from "./actions";
import { useDeleteUndo } from "./delete-undo";
import styles from "./holidays.module.css";

// 04.2-UI-SPEC S2-f — 행 동작 칸의 `삭제` 하나(04.6-16: `RowAction danger` — 위험 색 · 맨 끝). 누르면 바로 지운다(확인 단계 없음).
// 성공하면 서버가 표·상태 줄을 다시 그리고(옮겨진 대체공휴일 포함, 토스트 없음) 결과
// 줄이 선다. 실패하면 그 행에만 실패 문구. 되돌리기로 돌아온 행이면 포커스를 받는다.

type DeleteResult =
  | { data?: unknown; validationErrors?: { _errors?: string[] }; serverError?: unknown }
  | null
  | undefined;

// 삭제 결과 → 행 실패 문구. 거절(루트 오류 — 화면을 연 뒤 규칙 행이 됐거나 자정이 지남)은 다시 해도
// 성공할 수 없어 원인(마지막 ` · ` 앞부분)을 이유로 단 비활성 `삭제`로 남긴다(DR-11 — 포커스를 잃지 않게). 연결·서버 실패(던짐은 null)는 `다시 시도`.
export function deleteFailure(result: DeleteResult): { text: string; retry: boolean } | null {
  if (result?.data) return null;
  const reason = result?.validationErrors?._errors?.[0];
  if (reason) {
    const cut = reason.lastIndexOf(" · ");
    return { text: `삭제 실패 · ${cut < 0 ? reason : reason.slice(0, cut)}`, retry: false };
  }
  return { text: "삭제 실패 · 다시 시도", retry: true };
}

export function DeleteHoliday({ id, date }: { id: string; date: string }) {
  const router = useRouter();
  const { show, focusDate, clearFocus } = useDeleteUndo();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ text: string; retry: boolean } | null>(null);
  const [restored] = useState(() => focusDate === date);

  // 되돌린 행이 포커스를 받았으면 표식을 지운다(다른 행이 다시 받지 않게).
  useEffect(() => {
    if (restored) clearFocus();
  }, [restored, clearFocus]);

  async function handleDelete() {
    setPending(true);
    setFailure(null);
    let result: Awaited<ReturnType<typeof deleteHolidayAction>> | null = null;
    try {
      result = await deleteHolidayAction({ id });
      if (result?.data) {
        if (result.data.deleted) {
          show({ id: result.data.id, date: result.data.date, name: result.data.name, kind: result.data.kind });
        }
        router.refresh();
        return;
      }
    } catch {
      // 연결이 끊긴 경우 — 아래에서 실패 줄을 보인다.
    }
    setPending(false);
    setFailure(deleteFailure(result));
  }

  // 다시 해도 안 되는 거절 — 이유를 단 비활성(aria-disabled). 이유가 붙으면 `RowAction`이 버튼을 새로 그려 포커스를 잃으므로
  // 같은 때 `autoFocus`로 다시 받는다(DR-11 — 눌렀던 「삭제」에 포커스가 남는다).
  const rejectedText = failure?.retry === false ? failure.text : null;

  return (
    <span className={styles.rowAction}>
      <RowActions>
        {rejectedText !== null ? (
          <RowAction danger disabled disabledReason={rejectedText} autoFocus onClick={() => void handleDelete()}>
            삭제
          </RowAction>
        ) : (
          <RowAction danger pending={pending} autoFocus={restored} onClick={() => void handleDelete()}>
            삭제
          </RowAction>
        )}
      </RowActions>
      {failure?.retry ? <span className={styles.rowError}>{failure.text}</span> : null}
    </span>
  );
}
