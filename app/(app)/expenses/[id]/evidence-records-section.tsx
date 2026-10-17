"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StaticTable, type StaticTableColumn } from "@/ui/table/StaticTable";
import { DetachDialog, type DetachTarget } from "../evidence/detach-dialog";
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
};

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
}: {
  items: LinkedEvidenceItem[];
  lockLine: EvidenceLockLineCode | null;
  number: string | null;
  lockLineShownAbove: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<DetachTarget | null>(null);
  if (items.length === 0) return null;
  const titleOf = (item: LinkedEvidenceItem) => [item.typeLabel, item.counterparty].filter(Boolean).join(" · ") || "—";
  const line = lockLine && !lockLineShownAbove ? EVIDENCE_LOCK_LINE_TEXT[lockLine] : null;

  return (
    <div className={styles.evidenceRecords}>
      <StaticTable
        caption="붙은 증빙"
        columns={COLUMNS}
        rows={items.map((item) => ({
          key: item.linkId,
          cells: [
            <span key="what">
              <span id={titleId(item.linkId)}>{titleOf(item)}</span>
              {item.pickedBy ? <span className={styles.evidencePicked}>{`${item.pickedBy} 고름 · ${item.pickedOn ?? ""}`}</span> : null}
            </span>,
            item.issuedOn,
            <Num key="total" value={item.totalKrw} />,
            item.action ? (
              <RowActions key="action" noWrap>
                <RowAction danger describedBy={titleId(item.linkId)} onClick={() => setTarget({ linkId: item.linkId, mode: item.action === "void" ? "void" : "detach", subtitle: [titleOf(item), number].filter(Boolean).join(" · ") })}>
                  {ACTION_LABEL[item.action]}
                </RowAction>
              </RowActions>
            ) : null,
          ],
        }))}
      />
      {line ? <p className={styles.evidenceLockLine}>{line}</p> : null}
      <DetachDialog target={target} onClose={() => setTarget(null)} onDone={() => router.refresh()} />
    </div>
  );
}
