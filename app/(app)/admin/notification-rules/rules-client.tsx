"use client";

import { startTransition, useMemo, useOptimistic, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RuleRowView } from "@/domain/notify/rule-admin";
import { Button } from "@/ui/button/Button";
import { StaticTable } from "@/ui/table/StaticTable";
import { setRuleEnabledAction } from "./actions";
import styles from "./notification-rules.module.css";

// SC-05 규칙 표(N1 · N2 · N4). 행 · 순서 · 이름은 서버가 등록부에서 만든 `rows` 그대로 — 이 파일에 종류를 적지 않는다.
// 켬 체크박스는 누르면 즉시 저장하고 체크 상태가 곧 결과다(토스트 · 되돌리기 없음). 요청 중 그 체크박스만 aria-busy + aria-disabled(누름 무시 — 공통 계약 10 · U6),
// 실패하면 응답 뒤 한 번 체크가 원래대로 돌아가고(useOptimistic이 트랜잭션이 끝나며 서버 값으로 되돌린다) 표 위에 오류 줄이 뜬다.

type Failure = { kind: string; enabled: boolean };

function daysText(row: RuleRowView): string {
  if (row.days === null) return "—";
  return `${row.days}${row.dateUnit === "business" ? "영업일" : "일"}`;
}

function recipientsText(row: RuleRowView): string {
  return [row.defaultRecipientLabel, ...row.extraRoleNames.map((name) => `+ ${name}`)].join(" ");
}

export function RulesTable({ rows, canWrite }: { rows: RuleRowView[]; canWrite: boolean }) {
  const router = useRouter();
  const serverEnabled = useMemo(() => Object.fromEntries(rows.map((row) => [row.kind, row.enabled])) as Record<string, boolean>, [rows]);
  const [enabledByKind, setOptimisticEnabled] = useOptimistic(serverEnabled, (current, patch: Failure) => ({ ...current, [patch.kind]: patch.enabled }));
  // 같은 틱의 연타를 막는 동기 잠금과, aria-busy를 그리는 상태 — 다른 행은 영향이 없다.
  const busyRef = useRef(new Set<string>());
  const [busyKinds, setBusyKinds] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<Failure | null>(null);

  function save(row: RuleRowView, enabled: boolean): void {
    if (busyRef.current.has(row.kind)) return;
    busyRef.current.add(row.kind);
    setBusyKinds(new Set(busyRef.current));
    setFailure(null);
    startTransition(async () => {
      setOptimisticEnabled({ kind: row.kind, enabled });
      let ok = false;
      try {
        const result = await setRuleEnabledAction({ kind: row.kind, enabled, version: row.version });
        ok = result?.data !== undefined && !result.serverError && !result.validationErrors;
      } catch {
        ok = false;
      }
      busyRef.current.delete(row.kind);
      setBusyKinds(new Set(busyRef.current));
      if (!ok) {
        setFailure({ kind: row.kind, enabled });
        router.refresh();
      }
    });
  }

  function retry(): void {
    if (!failure) return;
    const row = rows.find((candidate) => candidate.kind === failure.kind);
    if (row) save(row, failure.enabled);
  }

  return (
    <>
      {failure ? (
        <p role="alert" className={styles.alert}>
          <span>켬 저장 실패 · </span>
          <Button variant="tertiary" onClick={retry}>
            다시 시도
          </Button>
        </p>
      ) : null}
      <StaticTable
        caption="알림 규칙"
        columns={[
          { key: "name", header: "규칙", priority: "p1", rowHeader: true },
          { key: "days", header: "일수", priority: "p1" },
          { key: "enabled", header: "켬", priority: "p1" },
          { key: "recipients", header: "받는 사람", priority: "p2" },
          { key: "email", header: "이메일", priority: "p2" },
        ]}
        rows={rows.map((row, index) => {
          const enabled = enabledByKind[row.kind] ?? row.enabled;
          const busy = busyKinds.has(row.kind);
          const tone = (content: ReactNode) => <span className={enabled ? undefined : styles.muted}>{content}</span>;
          return {
            key: row.kind,
            headerId: `rule-row-${index}-name`,
            cells: [
              <span key="name" data-enabled={enabled ? "true" : "false"} className={enabled ? undefined : styles.muted}>
                {row.label}
              </span>,
              tone(daysText(row)),
              canWrite ? (
                <input
                  key="enabled"
                  type="checkbox"
                  className={styles.check}
                  aria-label={`${row.label} 켬`}
                  checked={enabled}
                  aria-busy={busy ? "true" : undefined}
                  aria-disabled={busy ? "true" : undefined}
                  onChange={(event) => {
                    if (busy) return;
                    save(row, event.target.checked);
                  }}
                />
              ) : (
                tone(enabled ? "켬" : "끔")
              ),
              tone(recipientsText(row)),
              tone(row.emailEnabled ? "켬" : "끔"),
            ],
          };
        })}
      />
    </>
  );
}
