"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { restoreArchivedAction } from "./actions";
import { Button } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import styles from "./archive.module.css";

export type ArchiveTableRow = {
  entity: string;
  label: string;
  id: string;
  name: string;
  archivedAtLabel: string;
  archivedBy: string | null;
};

// ADMN-12: page.tsx가 EMPTY/표 갈림을 여기로 넘긴 이유 — 복원은
// revalidatePath("/admin/archive")로 이 화면을 곧바로 다시 그리고, 복원된
// 항목은 더 이상 보관 목록에 없으므로 사라진다. 토스트 상태를 그 사라지는
// 쪽(행이든, 「표 전체」든)에 두면 재렌더가 토스트를 함께 지운다 —
// 실측(MutationObserver): 프로덕션 빌드에서는 토스트 노드가 추가된 지
// 9ms 만에 같이 제거돼 사람 눈에도 뜬 적이 없는 것처럼 보인다(dev 서버는
// 왕복이 느려 그 창이 우연히 넓어져 가려져 있었을 뿐, 로직은 같다).
//
// 표 하나만 클라이언트로 감싸는 첫 시도는 부족했다 — 보관함에 항목이
// 하나뿐이면(로컬 CI의 신규 DB가 그렇다) 복원 직후 rows.length가 0이 돼
// page.tsx의 조건이 이 컴포넌트 자체를 <ListEmpty>로 갈아 치워, 방금
// 끌어올린 토스트 상태까지 통째로 날아간다. 그래서 EMPTY/표 갈림 자체를
// 이 컴포넌트 안으로 옮겼다 — page.tsx는 rows.length와 무관하게 이
// 컴포넌트 하나만 항상 마운트하고, 토스트는 그 갈림 바깥의 형제로 둬서
// 표→EMPTY 전환에도 안 지워지고 자신의 4초 타이머(§7-6, Toast.tsx)로만
// 사라진다.
export function ArchiveTable({ rows }: { rows: ArchiveTableRow[] }) {
  const [toast, setToast] = useState<{ message: string; tone: "default" | "error" } | null>(null);

  return (
    <>
      {rows.length === 0 ? (
        // §7-7 EMPTY 예외 — 보관함이 비어 있는 것은 해소할 상태가 아니라
        // 정상이다(§7-12 알림함 EMPTY 예외와 같은 논리, DECISIONS.md
        // 2026-09-20 기록). 다음 한 수를 두지 않는다 — action을 생략한다.
        <ListEmpty message="보관함이 비어 있습니다" />
      ) : (
        <table className={styles.table}>
          <caption className={styles.srOnly}>보관함</caption>
          <thead>
            <tr>
              <th scope="col">종류</th>
              <th scope="col">이름</th>
              <th scope="col">보관 시각</th>
              <th scope="col">보관한 사람</th>
              <th scope="col">동작</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={`${item.entity}:${item.id}`}>
                <td>{item.label}</td>
                <td>{item.name}</td>
                <td className={styles.archivedAt}>{item.archivedAtLabel}</td>
                <td>{item.archivedBy ?? "—"}</td>
                <td>
                  <RestoreRowButton
                    entity={item.entity}
                    id={item.id}
                    name={item.name}
                    onRestored={(name) => setToast({ message: `복원 · ${name} 복원됨`, tone: "default" })}
                    onFailed={() => setToast({ message: "복원 · 실패 · 다시 시도", tone: "error" })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}

// 개별 행의 「복원」 버튼 — 결과는 자신의 상태가 아니라 부모(ArchiveTable)의
// 토스트 상태로 올려보낸다. 이 컴포넌트 자신은 복원 성공 시 행과 함께
// 사라져도 상관없다(더 이상 할 일이 없다) — 토스트만은 살아남아야 한다.
function RestoreRowButton({
  entity,
  id,
  name,
  onRestored,
  onFailed,
}: {
  entity: string;
  id: string;
  name: string;
  onRestored: (name: string) => void;
  onFailed: () => void;
}) {
  const { execute, isExecuting } = useAction(restoreArchivedAction, {
    onSuccess: () => onRestored(name),
    onError: () => onFailed(),
  });

  return (
    <Button variant="tertiary" pending={isExecuting} onClick={() => execute({ entity, id })}>
      복원
    </Button>
  );
}
