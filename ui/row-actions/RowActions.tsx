"use client";

import Link from "next/link";
import { LinkPending } from "@/ui/link-pending/LinkPending";
import { Children, isValidElement, useId, type MouseEvent, type ReactNode } from "react";
import styles from "./RowActions.module.css";

// UI-SPEC 「공용 컴포넌트 계약」 행동 링크 — `<RowActions><RowAction href>수정</RowAction><RowAction onClick>숨기기</RowAction>
// <RowAction danger …>삭제</RowAction></RowActions>`. 링크와 버튼이 같은 모양이고 개수(1~3)와 무관하게 간격이 같다.
// `danger`는 어디에 적었든 DOM 맨 끝으로 가고 앞 간격이 더 넓다. 페이지 이동이면 href(`next/link` `scroll={false}` + 누른 직후 `LinkPending`),
// 이동이 아니면 onClick(button). button 형은 Button과 같은 규약(aria-disabled · 비활성 이유 · 대기 중 …)을 따른다.

type ActionCommon = {
  /** 위험한 동작(삭제 등) — 맨 끝에 떨어져 위험 색 글자. */
  danger?: boolean;
  children: ReactNode;
};

type LinkAction = ActionCommon & {
  href: string;
  onClick?: never;
  pending?: never;
  autoFocus?: never;
  disabled?: never;
  disabledReason?: never;
  describedBy?: never;
};

type ButtonActionBase = ActionCommon & {
  href?: never;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** 서버 액션 대기 중 — 라벨 뒤 「…」. 네이티브 disabled가 아니라 aria-disabled다(탭 순서에 남고 포커스 유지 — DR-11). */
  pending?: boolean;
  autoFocus?: boolean;
  /** 이 행동이 가리키는 대상 글자의 id(예: 실패 파일 행의 파일명) — `aria-describedby`에 이유 id보다 앞서 이어진다. */
  describedBy?: string;
};

// Button의 UX-06 규약 — 비활성은 이유와 함께만 쓴다.
type ButtonAction = ButtonActionBase &
  ({ disabled?: false; disabledReason?: string } | { disabled: true; disabledReason: string });

export type RowActionProps = LinkAction | ButtonAction;

/** 비활성 · 대기 중 클릭과 Enter를 무시하는 처리기 — aria-disabled 버튼은 탭 순서에 남아 눌릴 수 있다(Button과 같은 규약). */
export function rowActionClickHandler(options: {
  inactive: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}): (event: MouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    if (options.inactive) {
      event.preventDefault();
      return;
    }
    options.onClick(event);
  };
}

export function RowAction(props: RowActionProps) {
  const reasonId = useId();
  const dangerClass = props.danger ? styles.danger : "";
  const endClass = props.danger ? styles.dangerEnd : "";

  if (props.href !== undefined) {
    return (
      <Link href={props.href} scroll={false} className={[styles.action, dangerClass, endClass].filter(Boolean).join(" ")}>
        {props.children}
        {/* D6 — 패널을 여는 링크는 누른 직후 패널이 뜨기 전까지 「진행 중」(`ListScreen.primaryAction`과 같은 표기 · 새 모양 없음) */}
        <LinkPending />
      </Link>
    );
  }

  const inactive = props.pending === true || props.disabled === true;
  const reason = props.disabled === true && props.pending !== true ? props.disabledReason : undefined;
  const button = (
    <button
      type="button"
      autoFocus={props.autoFocus}
      aria-disabled={inactive ? "true" : undefined}
      aria-describedby={[props.describedBy, reason ? reasonId : undefined].filter(Boolean).join(" ") || undefined}
      onClick={rowActionClickHandler({ inactive, onClick: props.onClick })}
      className={[styles.action, dangerClass, reason ? "" : endClass].filter(Boolean).join(" ")}
    >
      <span>{props.children}</span>
      {props.pending ? <span aria-hidden="true">…</span> : null}
      {props.pending ? <span className="sr-only">처리 중</span> : null}
    </button>
  );
  if (!reason) return button;
  return (
    <span className={[styles.withReason, endClass].filter(Boolean).join(" ")}>
      {button}
      <span id={reasonId} className={styles.reason}>
        {reason}
      </span>
    </span>
  );
}

function isDangerAction(child: ReactNode): boolean {
  return isValidElement<{ danger?: boolean }>(child) && child.props.danger === true;
}

/** `noWrap` — 폰(<700)에서도 줄바꿈하지 않는다(짧은 두 행동 마스터 표용 — 넘침은 mobile-320-no-overflow가 잰다). */
export function RowActions({ children, noWrap }: { children: ReactNode; noWrap?: boolean }) {
  const items = Children.toArray(children);
  const ordered = [...items.filter((child) => !isDangerAction(child)), ...items.filter(isDangerAction)];
  return (
    <span data-ui="row-actions" className={noWrap ? `${styles.row} ${styles.noWrap}` : styles.row}>
      {ordered}
    </span>
  );
}
