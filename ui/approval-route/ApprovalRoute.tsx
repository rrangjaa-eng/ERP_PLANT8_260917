import { Fragment } from "react";
import { Num } from "@/ui/num/Num";
import { StatusTag, type StatusTagKind } from "@/ui/status-tag/StatusTag";
import styles from "./ApprovalRoute.module.css";

// SYSTEM.md §6-3 결재선 · A3(DECISIONS.md 2026-09-29) — 두 모양. `line` = 제출 전 한 줄(`기안자 → 사람 단계 →
// … · 결재 규칙`), `list` = 제출 뒤 단계마다 한 줄. 입력은 서버가 해석한 표시 목록이고 이 컴포넌트는 그리기만
// 한다(지금 담당 · 담당 없음 · 막힘 판정을 하지 않는다). 색은 kind → 의미 토큰(status-display가 준 값)만.

export type ApprovalRouteLineStep = { person: string; label: string };

export type ApprovalRouteListStep = {
  key: string;
  // 자리가 비면 `—`.
  person: string;
  label: string;
  result: { text: string; kind: StatusTagKind };
  // `09-18 14:02`(없으면 null).
  at: string | null;
  // 반려 단계의 사유 원문(다음 줄).
  reason: string | null;
};

export type ApprovalRouteEndLine = { text: string; tone: "muted" | "danger" };

export type ApprovalRouteProps =
  | { mode: "line"; drafter: string; steps: ApprovalRouteLineStep[]; skippedNote?: string | null }
  | { mode: "list"; steps: ApprovalRouteListStep[]; endLines: ApprovalRouteEndLine[] };

export function ApprovalRoute(props: ApprovalRouteProps) {
  if (props.mode === "line") {
    return (
      <div className={styles.line} data-testid="approval-route-line">
        {props.drafter ? <span className={styles.drafter}>{props.drafter}</span> : null}
        {props.steps.map((step, index) => (
          <Fragment key={`${step.label}-${index}`}>
            {/* 04.1-06(CX-R3): 이름이 투영에서 빠지면 기안자 없이 첫 단계부터, 사람 없이 단계 이름만 그린다. */}
            {/* 화살표도 읽힌다 — 숨기면 보조 기술이 단계를 구분 없이 이어 읽는다(04.1-06 DOM 감사 #9 · SYSTEM §10). */}
            {props.drafter || index > 0 ? <span className={styles.arrow}>{" → "}</span> : null}
            {step.person ? (
              <>
                <span>{step.person}</span>{" "}
              </>
            ) : null}
            <span className={styles.label}>{step.label}</span>
          </Fragment>
        ))}
        {props.skippedNote ? <span className={styles.label}>{` · ${props.skippedNote}`}</span> : null}
        <span className={styles.label}> · 결재 규칙</span>
      </div>
    );
  }

  return (
    <ol className={styles.list}>
      {props.steps.map((step) => (
        <li key={step.key} className={styles.item}>
          <span>{step.person}</span> <span className={styles.label}>{step.label}</span>
          {" · "}
          <StatusTag kind={step.result.kind} variant="text" className={styles.result}>
            {step.result.text}
          </StatusTag>
          {step.at ? <span className={styles.at}> <Num value={step.at} /></span> : null}
          {step.reason ? <span className={styles.reason}>사유 · {step.reason}</span> : null}
        </li>
      ))}
      {props.endLines.map((line) => (
        <li key={line.text} className={line.tone === "danger" ? styles.endDanger : styles.end}>
          {line.text}
        </li>
      ))}
    </ol>
  );
}
