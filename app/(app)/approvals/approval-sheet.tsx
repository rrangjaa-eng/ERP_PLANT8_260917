"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { ApprovalRoute, type ApprovalRouteEndLine, type ApprovalRouteListStep } from "@/ui/approval-route/ApprovalRoute";
import { SidePanel, usePanel } from "@/ui/side-panel/SidePanel";
import { DayNumbers } from "@/app/(app)/leave/day-numbers";
import leaveStyles from "@/app/(app)/leave/leave.module.css";
import { ConflictLine } from "./conflict-line";
import styles from "./approval-sheet.module.css";

// 04.1-05 S5 폰 결재 시트(§7-8 · A3 — 「결재 옆판」의 폰 자리) → 04.6-17: 공용 옆 패널 `SidePanel` 제어 형태(`onClose`) 위의 내용이다
// (DR4 A — PC 오른쪽 480 · 폰 아래 시트, Q1 A — 뒤를 막는다. 모양 · 첫 포커스 · Esc · 가림막 · 연 요소로 포커스 복귀는 `SidePanel`이 한다).
// 본문 행은 문서 종류가 준 상세(엔진이 detailDto로 투영한 뒤 buildDetailRows가 만든 행)라 이 파일은 연차를 모른다. 행동 줄은 서버 가능 행동
// 그대로 — 2차 `반려` 또는 `회수`(기안자이면서 담당) → 1차 `승인`(D17: 시트는 폼이 아니라 패널 폼의 「취소」 행동 줄을 쓰지 않는다).

export type SheetDetailRow = { label: string; lines: { text: string; tone: "default" | "muted" | "warning" }[] };
export type SheetAction = "approve" | "reject" | "withdraw" | "resubmit";

export type ApprovalSheetItem = {
  instanceId: string;
  version: number;
  title: string;
  subtitle: string;
  rows: SheetDetailRow[];
  steps: ApprovalRouteListStep[];
  endLines: ApprovalRouteEndLine[];
  actions: SheetAction[];
  // 문서 화면 주소 — 결재 내용 아래 3차 링크 「문서 화면 열기」(사용자 카드 답 2026-10-03 23:12 KST: 링크 넣음). 없으면 링크를 그리지 않는다.
  href: string | null;
  // 05-01 E3: 종류가 준 `승인` 막힘 이유(구조 값) — 있으면 `승인`은 aria-disabled + 이유 글자, `반려`는 그대로 산다.
  approveBlockedReason: string | null;
};

// 05-01 E7(Round 4 D3 · Z3 A): 승인 서버 액션 호출 · 토스트 문구 · 서버 거부 → 충돌 문구 변환은 호출자가 한다.
export type ApproveOutcome = { message: string } | { conflict: string };

export type ApprovalSheetProps = {
  item: ApprovalSheetItem | null;
  onClose: () => void;
  onApprove: (target: { instanceId: string; version: number }) => Promise<ApproveOutcome>;
  onApproved: (message: string) => void;
  // 2차(반려 · 회수) — 이 시트를 닫고 확인 시트를 연다(시트 중첩 없음).
  onSecondary: (action: "reject" | "withdraw", item: ApprovalSheetItem) => void;
};

const SECONDARY_LABEL: Record<"reject" | "withdraw", string> = { reject: "반려", withdraw: "회수" };
// 잔고·일수 숫자만 700(문서 화면과 같은 행 — 04.1-06 DOM 감사 #4).
const DAY_NUMBER_ROWS = new Set(["잔고", "일수"]);

// `SidePanel`은 호출부가 열린 동안만 렌더한다(제어 형태) — item이 null이면 아무것도 그리지 않는다.
export function ApprovalSheet({ item, onClose, onApprove, onApproved, onSecondary }: ApprovalSheetProps) {
  if (!item) return null;
  return (
    <SidePanel title={item.title} onClose={onClose}>
      <SheetContent item={item} onApprove={onApprove} onApproved={onApproved} onSecondary={onSecondary} />
    </SidePanel>
  );
}

function SheetContent({
  item,
  onApprove,
  onApproved,
  onSecondary,
}: { item: ApprovalSheetItem } & Pick<ApprovalSheetProps, "onApprove" | "onApproved" | "onSecondary">) {
  const router = useRouter();
  const panel = usePanel();
  // 제출 중 — 렌더를 기다리지 않고 동기로 바뀌어 두 번째 누름을 무시한다(T7 · §7-17). 같은 값을 `SidePanel`의 닫기 가드에도 알려
  // 제출 중에는 Esc · x · 가림막 닫기가 무시된다(D7).
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  async function approve() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    panel?.setGuard({ dirtyCount: 0, submitting: true });
    setPending(true);
    setConflict(null);
    try {
      const outcome = await onApprove({ instanceId: item.instanceId, version: item.version });
      if ("message" in outcome) {
        onApproved(outcome.message);
        panel?.requestClose("success");
        router.refresh();
      } else if (outcome.conflict) {
        setConflict(outcome.conflict);
      }
    } finally {
      submittingRef.current = false;
      panel?.setGuard({ dirtyCount: 0, submitting: false });
      setPending(false);
    }
  }

  function secondary(action: "reject" | "withdraw") {
    if (submittingRef.current) return;
    panel?.requestClose("cancel");
    onSecondary(action, item);
  }

  const secondaryAction = item.actions.find((action): action is "reject" | "withdraw" => action === "reject" || action === "withdraw");

  return (
    <>
      <div className={styles.body}>
        {item.subtitle ? <p className={styles.subtitle}>{item.subtitle}</p> : null}
        <dl className={styles.kv}>
          {item.rows.map((row) => (
            <Fragment key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.lines.map((line, index) => (
                  <span key={index} className={styles[`tone-${line.tone}`]}>
                    {DAY_NUMBER_ROWS.has(row.label) ? <DayNumbers text={line.text} /> : line.text}
                  </span>
                ))}
              </dd>
            </Fragment>
          ))}
          <dt>결재선</dt>
          <dd>
            <ApprovalRoute mode="list" steps={item.steps} endLines={item.endLines} />
          </dd>
        </dl>
        {item.href ? (
          <p className={styles.documentLinkLine}>
            <Link href={item.href} className={[leaveStyles.link, styles.documentLink].join(" ")}>
              문서 화면 열기
            </Link>
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        {conflict ? <ConflictLine message={conflict} /> : null}
        <div className={styles.buttons}>
          {secondaryAction ? (
            <span className={styles.secondaryWrap}>
              {/* 제출 중 나머지 버튼 — ui/button의 disabled는 네이티브 disabled가 아니라 aria-disabled다(§7-1 ⑦ DR-11). */}
              <Button variant="secondary" disabled={pending} onClick={() => secondary(secondaryAction)}>
                {SECONDARY_LABEL[secondaryAction]}
              </Button>
            </span>
          ) : null}
          {item.actions.includes("approve") ? (
            <span className={styles.primaryWrap}>
              <Button
                variant="primary"
                pending={pending}
                disabled={Boolean(item.approveBlockedReason)}
                disabledReason={item.approveBlockedReason ?? undefined}
                reasonTone="block"
                onClick={() => void approve()}
              >
                승인
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
