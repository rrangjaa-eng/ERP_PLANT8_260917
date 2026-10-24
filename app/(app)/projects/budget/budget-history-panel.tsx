"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import type { BudgetHistoryDto, BudgetHistoryEntry } from "@/domain/projects/budget";
import { formatKrw } from "@/lib/format-number";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { KvList } from "@/ui/kv-list/KvList";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { SidePanel, usePanel } from "@/ui/side-panel/SidePanel";
import { StaticTable } from "@/ui/table/StaticTable";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
// 패널 본문(스크롤) · 행동 줄(아래 고정) 모양은 PanelForm과 같은 클래스(새 모양 없음 — SYSTEM §7-8 옆 패널).
import panelStyles from "@/ui/side-panel/PanelForm.module.css";
import { listBudgetHistoryAction, setBudgetManuallyAction } from "./actions";
import styles from "./budget.module.css";

// 07-24(SC-21 · K9 · D-729 · U16): 예산 이력 옆 패널(폰은 같은 SidePanel이 아래 시트). 기본은 읽기 — 1차가 없다.
// 3차 `예산 바꾸기`(쓰기 판정이 참일 때만)를 누르면 같은 패널 안에 `예산` · `사유` 칸과 행동 줄(2차 `취소 Esc` · 1차 `예산 저장`)이 나타난다.
// Esc 첫 번은 편집만 닫고(preventDefault — SidePanel이 닫지 않는다) 다음 Esc가 패널을 닫는다. 결과는 현재 값과 이력 맨 위 줄(토스트 없음).

const FORMULA_LABEL = "현재 예산";
// 읽기 실패 한 줄(SYSTEM §8 규칙 3 명사형) — 다시 시도는 옆 버튼이 말한다(감사 #11).
const LOAD_FAILED = "예산 이력 불러오기 실패";
const SAVE_FAILED = "저장 실패 · 다시 시도";
// 서버 충돌 문구(domain/projects/budget.ts)의 원인 자리 — 다음 행동 `새로 불러오기`는 그 줄의 버튼이 한다(감사 #4).
const CONFLICT = "다른 사람이 먼저 수정";

// 음수는 표와 같은 하이픈 마이너스(SYSTEM §2-4 — 감사 #8).
function signedKrw(deltaKrw: number): string {
  return `${deltaKrw > 0 ? "+" : "-"}${formatKrw(Math.abs(deltaKrw))}`;
}

// 패널 닫기 가드(SidePanel)에 바뀐 칸 수 · 저장 중을 알린다 — PanelForm과 같은 가드(DR1 A 입력 버리기 확인 · SYSTEM §7-8 제출 중 닫기 무시, 감사 #2 · #3).
// 이 패널은 읽기가 기본이라 PanelForm을 쓰지 않는다(편집 취소 = Esc 첫 번 · UI-SPEC SC-21).
function ReportPanelGuard({ dirtyCount, submitting }: { dirtyCount: number; submitting: boolean }) {
  const panel = usePanel();
  useEffect(() => {
    panel?.setGuard({ dirtyCount, submitting });
  }, [panel, dirtyCount, submitting]);
  return null;
}

function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function errorOf(result: { serverError?: unknown; validationErrors?: unknown }): string | null {
  if (typeof result.serverError === "string") return result.serverError;
  if (result.validationErrors) return "입력값 확인 · 다시 입력";
  return null;
}

function HistoryRows({ entries }: { entries: BudgetHistoryEntry[] }) {
  return (
    <StaticTable
      caption="예산 이력"
      columns={[
        { key: "at", header: "일시", priority: "p1" },
        { key: "reason", header: "사유", priority: "p1" },
        { key: "delta", header: "변동분", priority: "p1", align: "right" },
      ]}
      rows={entries.map((entry) => ({
        key: entry.id,
        cells: [
          <Num key="at" value={entry.at} />,
          <span key="reason" className={styles.reason}>
            <span>{entry.reasonWord}</span>
            {entry.memo ? <span className={styles.memo}>{entry.memo}</span> : null}
          </span>,
          <Num key="delta" value={signedKrw(entry.deltaKrw)} />,
        ],
      }))}
    />
  );
}

export function BudgetHistoryPanel({ projectId, projectLabel, onClose }: { projectId: string; projectLabel: string; onClose: () => void }) {
  const { executeAsync: loadHistory } = useAction(listBudgetHistoryAction);
  const { executeAsync: saveBudget } = useAction(setBudgetManuallyAction);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [history, setHistory] = useState<BudgetHistoryDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  // 새 history가 그려진 뒤 옮길 포커스 — `더 보기`가 사라지면 다음 행동으로(감사 #5), 새로 불러오면 `예산` 칸으로(감사 #4).
  const focusAfterLoadRef = useRef<string | null>(null);
  // 편집을 닫은 뒤 포커스를 `예산 바꾸기`로 — 처음 렌더(편집한 적 없음)에는 옮기지 않는다.
  const wasEditingRef = useRef(false);
  const ids = { edit: `budget-edit-${projectId}`, budget: `budget-amount-${projectId}`, memo: `budget-memo-${projectId}`, open: `budget-open-${projectId}` };

  // 열리면(또는 `다시 시도`) 첫 쪽을 읽는다 — 상태는 응답 뒤에만 바꾼다.
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => {
    let alive = true;
    listBudgetHistoryAction({ projectId, cursor: null }).then(
      (result) => {
        if (!alive) return;
        if (result?.data) setHistory(result.data);
        else setLoadError(errorOf(result ?? {}) ?? LOAD_FAILED);
      },
      () => {
        if (alive) setLoadError(LOAD_FAILED);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId, loadTick]);

  function retry() {
    setLoadError(null);
    setLoadTick((tick) => tick + 1);
  }

  useEffect(() => {
    if (editing) {
      document.getElementById(ids.budget)?.focus();
      wasEditingRef.current = true;
    } else if (wasEditingRef.current) {
      document.getElementById(ids.edit)?.focus();
    }
  }, [editing, ids.budget, ids.edit]);

  useEffect(() => {
    const target = focusAfterLoadRef.current;
    if (!target) return;
    focusAfterLoadRef.current = null;
    document.getElementById(target)?.focus();
  }, [history]);

  // 바뀐 칸 수 — 숫자 칸의 hidden 값은 다시 그린 뒤에 바뀌므로 다음 프레임에 센다(PanelForm과 같은 이유).
  const countDirty = useCallback(() => {
    requestAnimationFrame(() => {
      const form = formRef.current;
      if (!form || !history || !editing) return;
      const data = new FormData(form);
      const budgetChanged = formText(data.get("budgetKrw")) !== String(history.currentBudgetKrw);
      setDirtyCount(Number(budgetChanged) + Number(formText(data.get("memo")) !== ""));
    });
  }, [history, editing]);

  useEffect(countDirty, [countDirty]);

  function closeEdit() {
    setEditing(false);
    setDirtyCount(0);
    setBudgetError(null);
    setMemoError(null);
    setFormError(null);
  }

  async function loadMore() {
    if (!history?.nextCursor) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const result = await loadHistory({ projectId, cursor: history.nextCursor });
      const next = result?.data;
      if (next) {
        if (!next.nextCursor) focusAfterLoadRef.current = ids.open;
        setHistory({ ...next, entries: [...history.entries, ...next.entries] });
      } else setLoadError(errorOf(result ?? {}) ?? LOAD_FAILED);
    } catch {
      setLoadError(LOAD_FAILED);
    } finally {
      setLoadingMore(false);
    }
  }

  // 충돌 뒤 `새로 불러오기` — 이력 첫 쪽을 다시 읽어 현재 값 · `예산` 칸(key로 새로 그림) · 맨 위 줄을 새 값으로, 뒤 표도 새로 그린다. 사유는 그대로.
  async function reload() {
    try {
      const result = await loadHistory({ projectId, cursor: null });
      if (!result?.data) {
        setFormError(errorOf(result ?? {}) ?? LOAD_FAILED);
        return;
      }
      focusAfterLoadRef.current = ids.budget;
      setFormError(null);
      setHistory(result.data);
      router.refresh();
    } catch {
      setFormError(LOAD_FAILED);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!history || saving) return;
    const data = new FormData(event.currentTarget);
    const raw = formText(data.get("budgetKrw"));
    const budgetKrw = raw === "" ? Number.NaN : Number(raw);
    setBudgetError(null);
    setMemoError(null);
    setFormError(null);
    if (!Number.isSafeInteger(budgetKrw) || budgetKrw < 0) {
      setBudgetError("예산은 0 이상 · 금액 수정");
      return;
    }
    setSaving(true);
    try {
      const result = await saveBudget({ projectId, budgetKrw, expectedBudgetKrw: history.currentBudgetKrw, memo: formText(data.get("memo")) });
      if (result?.data) {
        setHistory(result.data);
        closeEdit();
        return;
      }
      const message = errorOf(result ?? {}) ?? SAVE_FAILED;
      if (message.startsWith("사유")) setMemoError(message);
      else if (message.startsWith("예산은")) setBudgetError(message);
      else setFormError(message);
    } catch {
      // 네트워크 끊김 등으로 액션이 던지면 처리 중을 풀고 한 줄로 알린다(감사 #1) — 입력은 그대로 남아 다시 누르면 된다.
      setFormError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  // Esc 첫 번 = 편집 닫기(SidePanel이 닫지 않게 preventDefault). 저장 중에는 편집도 닫지 않는다(감사 #2 — 결과를 패널에서 본다).
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!editing || event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!saving) closeEdit();
  }

  return (
    <SidePanel title="예산 이력" onClose={onClose}>
      <ReportPanelGuard dirtyCount={dirtyCount} submitting={saving} />
      <Form
        ref={formRef}
        id={`budget-history-${projectId}`}
        layout="panel"
        onSubmit={(event) => void handleSave(event)}
        onKeyDown={handleKeyDown}
        onInput={countDirty}
        onChange={countDirty}
        noValidate
      >
        <div className={panelStyles.fields}>
          <KvList
            items={[
              { label: "프로젝트", value: projectLabel },
              { label: FORMULA_LABEL, value: <Num value={history ? history.currentBudgetKrw : null} /> },
            ]}
          />
          {history?.canWrite && editing ? (
            <>
              <TextField
                key={history.currentBudgetKrw}
                id={ids.budget}
                label="예산"
                name="budgetKrw"
                numberKind="krw"
                defaultValue={String(history.currentBudgetKrw)}
                error={budgetError ?? undefined}
              />
              <TextField id={ids.memo} label="사유" name="memo" maxLength={500} error={memoError ?? undefined} />
            </>
          ) : history?.canWrite ? (
            <div className={styles.panelAction}>
              <Button id={ids.edit} variant="tertiary" onClick={() => setEditing(true)}>
                예산 바꾸기
              </Button>
            </div>
          ) : null}
          {loadError && !history ? (
            <ListEmpty message={loadError} tone="error" action={{ label: "다시 시도", onClick: retry }} />
          ) : !history ? (
            <TableSkeleton columns={[{ key: "at", label: "일시" }, { key: "reason", label: "사유" }, { key: "delta", label: "변동분", align: "right" }]} />
          ) : history.entries.length === 0 ? (
            <ListEmpty message="이력 없음" />
          ) : (
            <HistoryRows entries={history.entries} />
          )}
          <div className={styles.panelAction}>
            {loadError && history ? (
              <p role="alert" className={`${panelStyles.line} ${panelStyles.reason}`}>
                {loadError}
              </p>
            ) : null}
            {history?.nextCursor ? (
              <Button variant="tertiary" pending={loadingMore} onClick={() => void loadMore()}>
                더 보기
              </Button>
            ) : null}
            <Link id={ids.open} href={`/projects/${projectId}`} className={buttonLinkClassName("tertiary")}>
              프로젝트 열기
            </Link>
          </div>
        </div>
        {editing ? (
          <div className={panelStyles.actions}>
            {formError ? (
              <p role="alert" className={`${panelStyles.line} ${panelStyles.reason}`}>
                {formError.startsWith(CONFLICT) ? (
                  <>
                    {CONFLICT}{" "}
                    <Button variant="tertiary" onClick={() => void reload()}>
                      새로 불러오기
                    </Button>
                  </>
                ) : (
                  formError
                )}
              </p>
            ) : null}
            <Button variant="secondary" shortcut="Esc" disabled={saving} onClick={closeEdit}>
              취소
            </Button>
            <Button type="submit" variant="primary" pending={saving}>
              예산 저장
            </Button>
          </div>
        ) : null}
      </Form>
    </SidePanel>
  );
}
