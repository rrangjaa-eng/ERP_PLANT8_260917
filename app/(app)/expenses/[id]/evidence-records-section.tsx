"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable, type StaticTableColumn } from "@/ui/table/StaticTable";
import { DetachDialog, previewExpectedKrw, type DetachTarget } from "../evidence/detach-dialog";
import { PickEvidenceDialog } from "../evidence/pick-evidence-dialog";
import { EVIDENCE_LOCK_LINE_TEXT, type EvidenceLockLineCode } from "./evidence-locked-lines";
import styles from "./expense.module.css";

// 06.1-06(E21 · S7 · DB-7): 문서 「증빙」 섹션의 붙은 증빙 기록 읽기 행 — `{종류} · {거래처}` · 날짜 · 합계 · 행 끝 위험 행동(떼기 · 무효 처리).
// 행 끝 행동 · 잠김 줄은 서버 권리(evidenceRecordRights) 그대로 그린다 — 숨긴 행동 자리에 빈 칸 · 비활성 버튼 없음. 05 첨부 영역이 같은 잠김 줄을
// 이미 그리면(drafterLocked · completedProjectLocked) 다시 그리지 않는다(섹션당 하나 — PA-LOCKCODE). 작성자 붙임만 2행 `{이름} 고름 · {MM-DD}`.

export type LinkedEvidenceItem = {
  linkId: string;
  typeLabel: string | null;
  counterparty: string | null;
  issuedOn: string;
  totalKrw: number | null;
  pickedBy: string | null;
  pickedOn: string | null;
  action: "detach" | "void" | null;
  ownDetach: boolean;
  /** 확인 필요 사유(서버 글자 그대로) — 있으면 2행 `확인 필요 · {사유}`(증빙 패널 상태 줄과 같은 꼴). */
  needsCheck: string | null;
};

/** 06.1-08 — 증빙 고르기 트리거. 모드가 none이거나 후보가 0이면 서버가 이 값을 null로 준다(트리거 DOM 0). */
export type EvidencePickState = { ownerKind: "expense"; ownerId: string; mode: "registrar" | "author"; count: number };

const COLUMNS: StaticTableColumn[] = [
  { key: "what", header: "증빙", priority: "p1" },
  { key: "issuedOn", header: "날짜", priority: "p2" },
  { key: "total", header: "합계", priority: "p1", align: "right" },
  { key: "action", header: "행동", priority: "p1" },
];

const ACTION_LABEL = { detach: "떼기", void: "무효 처리" } as const;

// D-4 — 반복 `떼기` · `무효 처리`의 접근 이름에 줄 식별(`{종류} · {거래처}`)을 잇는다(증빙 목록 행 행동 describedBy와 같은 꼴 — §7-3).
const titleId = (linkId: string) => `evidence-link-title-${linkId}`;

export function EvidenceRecordsSection({
  items,
  lockLine,
  number,
  lockLineShownAbove,
  pick,
}: {
  items: LinkedEvidenceItem[];
  lockLine: EvidenceLockLineCode | null;
  number: string | null;
  lockLineShownAbove: boolean;
  pick: EvidencePickState | null;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<DetachTarget | null>(null);
  // D-5 — 미리 보기를 받는 줄(그동안 그 줄 행동은 `…`, 다른 줄 행동은 무반응). 받은 뒤에 창을 연다.
  const [opening, setOpening] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const attachedPending = useRef(false);
  // 붙인 뒤 새로 고침으로 섹션이 바뀌면 — 포커스는 트리거, 트리거가 사라졌으면(후보 0) 새 읽기 행의 첫 행동(없으면 섹션).
  useEffect(() => {
    if (!attachedPending.current) return;
    attachedPending.current = false;
    const root = rootRef.current;
    (root?.querySelector<HTMLElement>("[data-evidence-pick]") ?? root?.querySelector<HTMLElement>("table button") ?? root)?.focus();
  }, [items.length, pick?.count]);
  // 뗀 뒤(PR-C D-2 · §7-17) — 새로 고침으로 그 행이 빠지면 포커스는 다음 행의 행동(없으면 앞 행) → 다시 선 `증빙 고르기` → 화면 제목. 뗀 순간의 행 순서를 기억한다.
  const detachedPending = useRef<{ linkId: string; order: string[] } | null>(null);
  useEffect(() => {
    const pending = detachedPending.current;
    if (!pending || items.some((item) => item.linkId === pending.linkId)) return;
    detachedPending.current = null;
    const at = pending.order.indexOf(pending.linkId);
    const candidates = [...pending.order.slice(at + 1), ...pending.order.slice(0, Math.max(at, 0)).reverse()];
    const root = rootRef.current;
    const action = candidates.map((linkId) => root?.querySelector<HTMLElement>(`button[aria-describedby="${titleId(linkId)}"]`)).find((button) => button);
    (action ?? root?.querySelector<HTMLElement>("[data-evidence-pick]") ?? document.querySelector<HTMLElement>('[data-ui="screen-title"]'))?.focus();
  }, [items]);
  if (items.length === 0 && !pick) return null;
  const titleOf = (item: LinkedEvidenceItem) => [item.typeLabel, item.counterparty].filter(Boolean).join(" · ") || "—";
  const line = lockLine && !lockLineShownAbove ? EVIDENCE_LOCK_LINE_TEXT[lockLine] : null;

  async function openDetach(item: LinkedEvidenceItem) {
    if (opening !== null) return;
    setOpening(item.linkId);
    const expectedKrw = await previewExpectedKrw(item.linkId, item.ownDetach);
    setOpening(null);
    setTarget({ linkId: item.linkId, mode: item.action === "void" ? "void" : "detach", subtitle: [titleOf(item), number].filter(Boolean).join(" · "), expectedKrw, own: item.ownDetach });
  }

  return (
    <div className={styles.evidenceRecords} ref={rootRef} tabIndex={-1}>
      {pick ? (
        <Button data-evidence-pick="" variant="tertiary" onClick={() => setPicking(true)}>
          {`증빙 고르기 ${pick.count}`}
        </Button>
      ) : null}
      {items.length > 0 ? <StaticTable
        caption="붙은 증빙"
        columns={COLUMNS}
        rows={items.map((item) => ({
          key: item.linkId,
          cells: [
            <span key="what">
              <span id={titleId(item.linkId)}>{titleOf(item)}</span>
              {item.pickedBy ? <span className={styles.evidencePicked}>{`${item.pickedBy} 고름 · ${item.pickedOn ?? ""}`}</span> : null}
              {item.needsCheck ? (
                <span className={styles.evidencePicked}>
                  <StatusTag status="확인 필요" variant="text" />
                  {` · ${item.needsCheck}`}
                </span>
              ) : null}
            </span>,
            item.issuedOn,
            <Num key="total" value={item.totalKrw} />,
            item.action ? (
              <RowActions key="action" noWrap>
                <RowAction
                  danger
                  describedBy={titleId(item.linkId)}
                  pending={opening === item.linkId}
                  busy={opening !== null && opening !== item.linkId}
                  onClick={() => void openDetach(item)}
                >
                  {ACTION_LABEL[item.action]}
                </RowAction>
              </RowActions>
            ) : null,
          ],
        }))}
      /> : null}
      {line ? <p className={styles.evidenceLockLine}>{line}</p> : null}
      <DetachDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          if (target) detachedPending.current = { linkId: target.linkId, order: items.map((item) => item.linkId) };
          router.refresh();
        }}
      />
      <PickEvidenceDialog
        target={picking && pick ? { ownerKind: pick.ownerKind, ownerId: pick.ownerId, mode: pick.mode, subtitle: [number, `후보 ${pick.count}`].filter(Boolean).join(" · ") } : null}
        onClose={() => setPicking(false)}
        onAttached={() => {
          attachedPending.current = true;
          router.refresh();
        }}
      />
    </div>
  );
}
