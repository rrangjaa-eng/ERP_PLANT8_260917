"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import type { BudgetHistoryDto, BudgetHistoryEntry } from "@/domain/projects/budget";
import { formatKrw } from "@/lib/format-number";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { KvList } from "@/ui/kv-list/KvList";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StaticTable } from "@/ui/table/StaticTable";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
// 패널 본문(스크롤) · 행동 줄(아래 고정) 모양은 PanelForm과 같은 클래스(새 모양 없음 — SYSTEM §7-8 옆 패널).
import panelStyles from "@/ui/side-panel/PanelForm.module.css";
import { listBudgetHistoryAction, setBudgetManuallyAction } from "./actions";
import styles from "./budget.module.css";

// 07-24(SC-21 · K9 · D-729 · U16): 예산 이력 옆 패널(폰은 같은 SidePanel이 아래 시트). 기본은 읽기 — 1차가 없다.
// 3차 `예산 바꾸기`(쓰기 판정이 참일 때만)를 누르면 같은 패널 안에 `예산` · `사유` 칸과 행동 줄(2차 `취소 Esc` · 1차 `예산 저장`)이 나타난다.
// Esc 첫 번은 편집만 닫고(preventDefault — SidePanel이 닫지 않는다) 다음 Esc가 패널을 닫는다. 결과는 현재 값과 이력 맨 위 줄(토스트 없음).

const FORMULA_LABEL = "PO 금액 × 원가율";

function signedKrw(deltaKrw: number): string {
  return `${deltaKrw > 0 ? "+" : "−"}${formatKrw(Math.abs(deltaKrw))}`;
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
  const [history, setHistory] = useState<BudgetHistoryDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // 편집을 닫은 뒤 포커스를 `예산 바꾸기`로 — 처음 렌더(편집한 적 없음)에는 옮기지 않는다.
  const wasEditingRef = useRef(false);
  const ids = { edit: `budget-edit-${projectId}`, budget: `budget-amount-${projectId}`, memo: `budget-memo-${projectId}` };

  // 열리면(또는 `다시 시도`) 첫 쪽을 읽는다 — 상태는 응답 뒤에만 바꾼다.
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => {
    let alive = true;
    listBudgetHistoryAction({ projectId, cursor: null }).then(
      (result) => {
        if (!alive) return;
        if (result?.data) setHistory(result.data);
        else setLoadError(errorOf(result ?? {}) ?? "불러오지 못했습니다 · 다시 시도");
      },
      () => {
        if (alive) setLoadError("불러오지 못했습니다 · 다시 시도");
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

  function closeEdit() {
    setEditing(false);
    setBudgetError(null);
    setMemoError(null);
    setFormError(null);
  }

  async function loadMore() {
    if (!history?.nextCursor) return;
    setLoadingMore(true);
    const result = await loadHistory({ projectId, cursor: history.nextCursor });
    setLoadingMore(false);
    const next = result?.data;
    if (next) setHistory({ ...next, entries: [...history.entries, ...next.entries] });
    else setLoadError(errorOf(result ?? {}) ?? "불러오지 못했습니다 · 다시 시도");
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
    const result = await saveBudget({ projectId, budgetKrw, expectedBudgetKrw: history.currentBudgetKrw, memo: formText(data.get("memo")) });
    setSaving(false);
    if (result?.data) {
      setHistory(result.data);
      closeEdit();
      return;
    }
    const message = errorOf(result ?? {}) ?? "저장 실패 · 다시 시도";
    if (message.startsWith("사유")) setMemoError(message);
    else if (message.startsWith("예산은")) setBudgetError(message);
    else setFormError(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!editing || event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    closeEdit();
  }

  return (
    <SidePanel title="예산 이력" onClose={onClose}>
      <Form id={`budget-history-${projectId}`} layout="panel" onSubmit={(event) => void handleSave(event)} onKeyDown={handleKeyDown} noValidate>
        <div className={panelStyles.fields}>
          <KvList
            items={[
              { label: "프로젝트", value: projectLabel },
              { label: FORMULA_LABEL, value: <Num value={history ? history.currentBudgetKrw : null} /> },
            ]}
          />
          {history?.canWrite && editing ? (
            <>
              <TextField id={ids.budget} label="예산" name="budgetKrw" numberKind="krw" defaultValue={String(history.currentBudgetKrw)} error={budgetError ?? undefined} />
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
            {history?.nextCursor ? (
              <Button variant="tertiary" pending={loadingMore} onClick={() => void loadMore()}>
                더 보기
              </Button>
            ) : null}
            <Link href={`/projects/${projectId}`} className={buttonLinkClassName("tertiary")}>
              프로젝트 열기
            </Link>
          </div>
        </div>
        {editing ? (
          <div className={panelStyles.actions}>
            {formError ? <p className={`${panelStyles.line} ${panelStyles.reason}`}>{formError}</p> : null}
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
