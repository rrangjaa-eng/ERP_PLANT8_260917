"use client";

import { startTransition, useMemo, useOptimistic, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import type { RuleRoleView, RuleRowView } from "@/domain/notify/rule-admin";
import { formReason } from "@/lib/actions/form-reason";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { SidePanel, editLinkFor } from "@/ui/side-panel/SidePanel";
import { StaticTable } from "@/ui/table/StaticTable";
import { Toast } from "@/ui/toast/Toast";
import { saveNotificationRuleAction, setRuleEnabledAction } from "./actions";
import styles from "./notification-rules.module.css";

// SC-05 규칙 표(N1 · N2 · N4). 행 · 순서 · 이름은 서버가 등록부에서 만든 `rows` 그대로 — 이 파일에 종류를 적지 않는다.
// 켬 체크박스는 누르면 즉시 저장하고 체크 상태가 곧 결과다(토스트 · 되돌리기 없음). 요청 중 그 체크박스만 aria-busy + aria-disabled(누름 무시 — 공통 계약 10 · U6),
// 실패하면 응답 뒤 한 번 체크가 원래대로 돌아가고(useOptimistic이 트랜잭션이 끝나며 서버 값으로 되돌린다) 표 위에 오류 줄이 뜬다.

const RULES_PATH = "/admin/notification-rules";

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
          // 폰(<700)은 읽기 + 켬 체크만 — 한 건 수정은 PC 옆 패널(P3은 폰에서 숨음).
          ...(canWrite ? [{ key: "actions", header: "동작", priority: "p3" as const }] : []),
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
              ...(canWrite
                ? [
                    <RowActions key="actions">
                      <RowAction href={`${RULES_PATH}?editId=${encodeURIComponent(row.kind)}`} describedBy={`rule-row-${index}-name`}>
                        수정
                      </RowAction>
                    </RowActions>,
                  ]
                : []),
            ],
          };
        })}
      />
    </>
  );
}

// 저장 뒤 목록으로 돌아와 토스트 한 개(패널을 떠나는 행동만 토스트 — §7-6). 닫히면 주소에서 `saved`를 떼어 새로 고침이 다시 띄우지 않게 한다.
export function SavedToast({ label }: { label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Toast
      message={`규칙 저장 · ${label}`}
      onDismiss={() => {
        setOpen(false);
        router.replace(RULES_PATH);
      }}
    />
  );
}

// K10 · N6 — 옆 패널 `{규칙} 수정`. 서버 페이지는 함수를 넘길 수 없어(RSC) returnFocusTo를 여기서 만든다(거래처 VendorPanel과 같은 꼴).
export function RulePanel({ row, roles }: { row: RuleRowView; roles: RuleRoleView[] }) {
  return (
    <SidePanel title={`${row.label} 수정`} closeHref={RULES_PATH} returnFocusTo={() => editLinkFor(row.kind)}>
      <RuleForm row={row} roles={roles} />
    </SidePanel>
  );
}

function RuleForm({ row, roles }: { row: RuleRowView; roles: RuleRoleView[] }) {
  const router = useRouter();
  const panelRef = useRef<PanelFormHandle>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const { execute, isExecuting, result, reset } = useAction(saveNotificationRuleAction, {
    onSuccess: () => panelRef.current?.succeed({ href: `${RULES_PATH}?saved=${encodeURIComponent(row.kind)}` }),
  });
  const range = row.daysRange;
  const rangeText = range ? `${range.min}~${range.max}` : "";
  const rangeMessage = `일수 범위 ${rangeText} · 다시 입력`;
  const serverError = result.serverError;
  const daysError = rangeError ?? (serverError?.startsWith("일수 범위") ? serverError : undefined);
  const conflict = serverError?.startsWith("다른 사람이 먼저 수정") === true;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRangeError(null);
    const formData = new FormData(event.currentTarget);
    let days: number | undefined;
    if (range) {
      const field = formData.get("days");
      const raw = typeof field === "string" ? field.trim() : "";
      days = raw === "" ? Number.NaN : Number(raw);
      if (!Number.isInteger(days) || days < range.min || days > range.max) {
        setRangeError(rangeMessage);
        return;
      }
    }
    execute({
      kind: row.kind,
      days,
      extraRoleIds: formData.getAll("extraRoleIds").filter((value): value is string => typeof value === "string"),
      emailEnabled: formData.has("emailEnabled"),
      version: row.version,
    });
  }

  const reason = conflict ? (
    <>
      다른 사람이 먼저 수정 ·{" "}
      <Button
        variant="tertiary"
        onClick={() => {
          reset();
          router.refresh();
        }}
      >
        새로 불러오기
      </Button>
    </>
  ) : daysError ? (
    daysError
  ) : serverError ? (
    formReason("저장", serverError).text
  ) : undefined;

  return (
    <PanelForm ref={panelRef} id="rule-form" label="규칙 저장" intent="edit" onSubmit={handleSubmit} pending={isExecuting} reason={reason} reasonId="rule-form-reason">
      {range ? (
        <div className={styles.daysField}>
          <div className={styles.withUnit}>
            <TextField id="days" name="days" label="일수" inputMode="numeric" defaultValue={row.days ?? ""} error={daysError} hintId="days-unit days-range" />
            <span id="days-unit" className={styles.unit}>
              {row.dateUnit === "business" ? "영업일" : "일"}
            </span>
          </div>
          <p id="days-range" className={styles.aux}>
            {rangeText}
          </p>
        </div>
      ) : null}
      <p className={styles.readLine}>기본 받는 사람 · {row.defaultRecipientLabel}</p>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>받는 사람 추가</legend>
        {roles.map((role) => (
          <label key={role.id} className={styles.checkRow}>
            <input type="checkbox" name="extraRoleIds" value={role.id} defaultChecked={row.extraRoleIds.includes(role.id)} />
            {role.name}
          </label>
        ))}
      </fieldset>
      <label className={styles.checkRow}>
        <input type="checkbox" name="emailEnabled" defaultChecked={row.emailEnabled} />
        이메일
      </label>
    </PanelForm>
  );
}
