"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import { Form } from "@/ui/form/Form";
import { Button } from "@/ui/button/Button";
import { isCtrlCombo } from "@/lib/shortcut";
import { usePanel } from "./SidePanel";
import styles from "./PanelForm.module.css";

// UI-SPEC 「옆 패널 상호작용 계약」 — 패널 안 폼. 본문은 `Form layout="panel"`(한 열 · 라벨 위 · 입력 전폭), 행동 줄은 아래 고정이고
// DOM · Tab · 시각 순서가 모두 2차 「취소 Esc」 → 1차(호출부 라벨 + Ctrl+Enter kbd)다. Ctrl+Enter가 제출한다.
// 제출 중에는 1차가 「진행 중」 + aria-disabled이고 Ctrl+Enter · 닫기가 무시된다(D7 — 닫기 가드는 `SidePanel`이 가진다).
// 바뀐 칸 수는 마운트 때 잡은 FormData 스냅숏과 지금 값을 비교해 `SidePanel`의 가드에 알린다(DR1 A 「입력 버리기」 확인).
// 제출 성공 뒤 동작(UQ-8 B · R9 D)은 이 파일 한 곳에만 둔다 — 호출부는 성공 신호(`succeed`)만 부른다.

export type PanelFormResult = {
  /** 등록 성공 뒤 행동 줄 위에 보일 결과 한 줄(`role="status"`). */
  status?: string;
  /** 새 대상에 상세 화면이 있으면 그 URL — 있으면 비우기 · 닫기 대신 그리로 이동한다(R9 D). */
  href?: string;
};

/** 호출부가 부르는 성공 신호. */
export type PanelFormHandle = {
  succeed(result?: PanelFormResult): void;
};

export type PanelFormProps = {
  /** 폼 id(셀렉터 · 라벨 연결 유지). */
  id: string;
  /** 1차 라벨 — 기존 문구 그대로(`거래처 등록`). */
  label: string;
  /** 성공 뒤: create = 패널을 열어 둔 채 칸을 비우고 첫 칸 포커스 · edit = 닫힘. */
  intent: "create" | "edit";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 제출 중(서버 액션 대기). */
  pending?: boolean;
  /** 막힘 이유 한 줄 — 있으면 1차를 막고 그 줄 id를 1차 aria-describedby가 가리킨다. 제출 중에는 그리지 않는다. */
  blockedReason?: string;
  /** 막힘 아닌 이유 한 줄(칸 오류 요약 · 서버 오류 + 다음 한 수 3차 등) — `blockedReason`보다 우선해 그 자리에 그려지고 1차 aria-describedby가 가리킨다. */
  reason?: ReactNode;
  /** `reason`·`blockedReason` 줄의 id(안 주면 내부 id). */
  reasonId?: string;
  /** 결과 한 줄(`role="status"`) — 호출부가 직접 정할 때. */
  status?: string;
  /** 성공 뒤 갈 URL(고정값일 때). 성공 때 알게 되는 URL은 `succeed({ href })`로 넘긴다. */
  successHref?: string;
  /** dirty 비교 칸 이름 — 없으면 폼 전체(자동으로 채워지는 칸을 뺄 때 넘긴다). */
  dirtyFields?: readonly string[];
  ref?: Ref<PanelFormHandle>;
  children: ReactNode;
};

// 제출 뒤 이 시간 안에 `pending`이 켜지지 않으면(칸 오류 등으로 액션이 안 돌았으면) 잠금을 푼다.
const SUBMIT_LOCK_GRACE_MS = 500;

const FIRST_FIELD = "input:not([type=hidden]), select, textarea";

function readValues(form: HTMLFormElement, dirtyFields: readonly string[] | undefined): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== "string") continue;
    if (dirtyFields && !dirtyFields.includes(key)) continue;
    values.set(key, values.has(key) ? `${values.get(key)}\u0000${value}` : value);
  }
  return values;
}

export function PanelForm({
  id,
  label,
  intent,
  onSubmit,
  pending = false,
  blockedReason,
  reason,
  reasonId,
  status,
  successHref,
  dirtyFields,
  ref,
  children,
}: PanelFormProps) {
  const panel = usePanel();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const snapshotRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef(pending);
  // 같은 틱의 두 번째 제출(Ctrl+Enter 연타 · 더블클릭)을 막는 동기 잠금 — `pending`은 다음 렌더에야 켜진다(D7 · R15-ii).
  // 호출부마다 따로 두지 않고 이 한 곳이 가진다. `pending`이 꺼질 때(응답 뒤) 풀린다.
  const submitLockRef = useRef(false);
  const submitLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyFieldsRef = useRef(dirtyFields);
  const [ownStatus, setOwnStatus] = useState<string | null>(null);
  const ownReasonId = useId();
  const lineId = reasonId ?? ownReasonId;

  useEffect(() => {
    dirtyFieldsRef.current = dirtyFields;
  });

  const reportGuard = useCallback(() => {
    const form = formRef.current;
    if (!form || !panel) return;
    const now = readValues(form, dirtyFieldsRef.current);
    const before = snapshotRef.current;
    let dirtyCount = 0;
    for (const key of new Set([...before.keys(), ...now.keys()])) {
      if ((before.get(key) ?? "") !== (now.get(key) ?? "")) dirtyCount += 1;
    }
    panel.setGuard({ dirtyCount, submitting: pendingRef.current });
  }, [panel]);

  // 마운트 때 스냅숏을 잡고 입력 이벤트마다 바뀐 칸 수를 다시 센다(제어 입력 칸도 DOM 값으로 센다).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    snapshotRef.current = readValues(form, dirtyFieldsRef.current);
    function onEdit() {
      setOwnStatus(null);
      reportGuard();
    }
    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);
    return () => {
      form.removeEventListener("input", onEdit);
      form.removeEventListener("change", onEdit);
    };
  }, [reportGuard]);

  useEffect(() => {
    pendingRef.current = pending;
    if (!pending) submitLockRef.current = false;
    reportGuard();
  }, [pending, reportGuard]);

  useEffect(
    () => () => {
      if (submitLockTimerRef.current) clearTimeout(submitLockTimerRef.current);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      succeed(result) {
        const href = result?.href ?? successHref;
        if (href) {
          panel?.moveFocusToResult();
          router.push(href);
          return;
        }
        if (intent === "edit") {
          panel?.requestClose("success");
          return;
        }
        const form = formRef.current;
        if (!form) return;
        form.reset();
        snapshotRef.current = readValues(form, dirtyFieldsRef.current);
        reportGuard();
        setOwnStatus(result?.status ?? null);
        form.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
      },
    }),
    [intent, panel, reportGuard, router, successHref],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending || submitLockRef.current) {
      event.preventDefault();
      return;
    }
    submitLockRef.current = true;
    if (submitLockTimerRef.current) clearTimeout(submitLockTimerRef.current);
    submitLockTimerRef.current = setTimeout(() => {
      if (!pendingRef.current) submitLockRef.current = false;
    }, SUBMIT_LOCK_GRACE_MS);
    setOwnStatus(null);
    onSubmit(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!isCtrlCombo(event, "Enter")) return;
    event.preventDefault();
    if (pending || blockedReason) return;
    formRef.current?.requestSubmit();
  }

  const lineText = status ?? ownStatus;
  const reasonContent = reason ?? (blockedReason !== undefined && !pending ? blockedReason : null);

  return (
    <Form id={id} layout="panel" ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <div className={styles.fields}>{children}</div>
      <div className={styles.actions}>
        {reasonContent ? (
          <p id={lineId} className={`${styles.line} ${styles.reason}`}>
            {reasonContent}
          </p>
        ) : lineText ? (
          <p className={styles.line} role="status">
            {lineText}
          </p>
        ) : null}
        <Button variant="secondary" shortcut="Esc" disabled={pending} onClick={() => panel?.requestClose("cancel")}>
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          shortcut="Ctrl+Enter"
          pending={pending}
          disabled={blockedReason !== undefined}
          aria-describedby={reasonContent ? lineId : undefined}
        >
          {label}
        </Button>
      </div>
    </Form>
  );
}
