"use client";

import { Fragment, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
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

// 05-10(D9): 증빙 갈래 행은 `files`를 더 싣는다 — 시트는 지출결의를 모르고 파일 id · 이름 · 크기 · 형식과 주소 주입 함수(evidenceUrl)만 안다.
export type SheetEvidenceFile = { id: string; name: string; sizeBytes: number; contentType: string };
export type SheetDetailRow = { label: string; lines: { text: string; tone: "default" | "muted" | "warning" }[]; files?: SheetEvidenceFile[] };
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
// 서버 거부 문구도 없는 실패(통신 끊김 · 입력 오류) — 시트가 조용히 되살아나지 않게 한 줄(05 /review B3).
export const APPROVE_FAILED_MESSAGE = "승인 실패";

export type ApprovalSheetProps = {
  item: ApprovalSheetItem | null;
  onClose: () => void;
  onApprove: (target: { instanceId: string; version: number }) => Promise<ApproveOutcome>;
  // 승인 성공 — 토스트와 새로 고침(다음 줄로 포커스 옮기기 포함)은 호출자가 한다(05-11 웨이브 13 D3 — 결재함 `useRefreshThenFocus`).
  onApproved: (message: string) => void;
  // 05-10: 증빙 썸네일 · 크게 보기 주소 — 시트가 열릴 때 호출부가 서버 액션으로 만든다(권한 판정 뒤 · 저장하지 않는다). 없으면 썸네일 없이 이름만.
  evidenceUrl?: (fileId: string) => Promise<string | null>;
  // 2차(반려 · 회수) — 이 시트를 닫고 확인 시트를 연다(시트 중첩 없음).
  onSecondary: (action: "reject" | "withdraw", item: ApprovalSheetItem) => void;
};

const SECONDARY_LABEL: Record<"reject" | "withdraw", string> = { reject: "반려", withdraw: "회수" };
// 잔고·일수 숫자만 700(문서 화면과 같은 행 — 04.1-06 DOM 감사 #4).
const DAY_NUMBER_ROWS = new Set(["잔고", "일수"]);

// `SidePanel`은 호출부가 열린 동안만 렌더한다(제어 형태) — item이 null이면 아무것도 그리지 않는다.
export function ApprovalSheet({ item, onClose, onApprove, onApproved, evidenceUrl, onSecondary }: ApprovalSheetProps) {
  if (!item) return null;
  return (
    <SidePanel title={item.title} onClose={onClose}>
      <SheetContent item={item} onApprove={onApprove} onApproved={onApproved} evidenceUrl={evidenceUrl} onSecondary={onSecondary} />
    </SidePanel>
  );
}

function SheetContent({
  item,
  onApprove,
  onApproved,
  evidenceUrl,
  onSecondary,
}: { item: ApprovalSheetItem } & Pick<ApprovalSheetProps, "onApprove" | "onApproved" | "evidenceUrl" | "onSecondary">) {
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
                {row.files ? (
                  <SheetEvidence files={row.files} evidenceUrl={evidenceUrl} />
                ) : (
                  row.lines.map((line, index) => (
                    <span key={index} className={styles[`tone-${line.tone}`]}>
                      {DAY_NUMBER_ROWS.has(row.label) ? <DayNumbers text={line.text} /> : line.text}
                    </span>
                  ))
                )}
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

function Paperclip() {
  return (
    <svg className={styles.evidenceClip} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.5 7.5 8 13a3.5 3.5 0 0 1-5-5l5.5-5.5a2.3 2.3 0 0 1 3.3 3.3L6.3 11.3a1.2 1.2 0 0 1-1.7-1.7L9.5 4.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function sizeOf(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// 05-10: 증빙 한 줄 — 썸네일 72×96(이미지일 때만, 주소는 시트가 열린 뒤 받는다) + 파일명 · 용량 + 3차 `크게 보기`(누른 때 새 주소 — 5분 만료).
function SheetEvidence({ files, evidenceUrl }: { files: SheetEvidenceFile[]; evidenceUrl: ApprovalSheetProps["evidenceUrl"] }) {
  const nameId = useId();
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!evidenceUrl) return;
    let cancelled = false;
    for (const file of files) {
      if (!file.contentType.startsWith("image/")) continue;
      void evidenceUrl(file.id)
        .then((url) => {
          if (!cancelled && url) setUrls((current) => ({ ...current, [file.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [files, evidenceUrl]);

  async function view(event: MouseEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    if (!evidenceUrl) return;
    // 새 탭을 먼저 열어 두고 주소를 넣는다(Attachments와 같은 방식 — 팝업 차단을 피한다).
    const opened = window.open("", "_blank");
    if (opened) opened.opener = null;
    const url = await evidenceUrl(id);
    if (!url) {
      opened?.close();
      return;
    }
    if (opened) opened.location.href = url;
  }

  return (
    <ul className={styles.evidenceList} data-testid="sheet-evidence">
      {files.map((file) => (
        <li key={file.id} className={styles.evidenceItem}>
          {urls[file.id] ? (
            // eslint-disable-next-line @next/next/no-img-element -- 서명 주소 이미지 — 최적화 대상이 아니다.
            <img src={urls[file.id]} alt="" className={styles.evidenceThumb} data-testid="sheet-evidence-thumb" />
          ) : (
            <span className={styles.evidenceThumb}>
              <Paperclip />
            </span>
          )}
          <span className={styles.evidenceText}>
            <span id={`${nameId}-${file.id}`} className={styles.evidenceName}>
              {file.name}
            </span>
            <span className={styles.evidenceMeta}>{sizeOf(file.sizeBytes)}</span>
            {evidenceUrl ? (
              <Button variant="tertiary" aria-describedby={`${nameId}-${file.id}`} onClick={(event) => void view(event, file.id)}>
                크게 보기
              </Button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
