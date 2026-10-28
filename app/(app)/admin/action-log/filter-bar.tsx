"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
// 잎(leaf) 모듈에서만 import한다 — domain/action-log(index)는 repositories를
// 거쳐 db/client.ts(pg)까지 이어지는 서버 전용 체인이라, 클라이언트
// 컴포넌트가 그 파일을 import하면 Next.js가 pg를 통째로 브라우저 번들에
// 넣으려다 실패한다(실측, filter-keys.ts 머리 주석 참고).
import { ACTION_LOG_FILTER_KEYS } from "@/domain/action-log/filter-keys";
import { exportActionLogAction, pruneActionLogAction } from "./actions";
import { Button } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import styles from "./action-log.module.css";

export type ActionLogFilterValues = {
  actorId?: string;
  from?: string;
  to?: string;
  actionType?: string;
  documentId?: string;
  includePruned?: boolean;
};

export type ActorOption = { id: string; name: string };
export type ActionTypeOption = { value: string; label: string };

// ACTION_LOG_FILTER_KEYS를 쓰고 키 문자열을 직접 적지 않는다 — 배열 순서가
// 화면 필드 순서를 겸한다(필터 자체 값은 defaultValues에서 읽는다).
const [ACTOR_KEY, FROM_KEY, TO_KEY, ACTION_TYPE_KEY, DOCUMENT_KEY, INCLUDE_PRUNED_KEY] = ACTION_LOG_FILTER_KEYS;

// 표 위 필터 줄(§6-1) — 네이티브 GET 폼. 값이 바뀌면 즉시 다시 제출해
// URL 검색 파라미터로 상태를 관리한다(새로 고침·공유 가능). 문서 번호만
// 타이핑 중 매 글자 제출을 피하려고 값이 바뀐 채 blur할 때와 Enter에서 제출한다.
export function FilterBar({
  people,
  actionTypes,
  defaultValues,
  hasFilter,
}: {
  people: ActorOption[];
  actionTypes: ActionTypeOption[];
  defaultValues: ActionLogFilterValues;
  hasFilter: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} method="get" className={styles.filterRow} aria-label="행동 로그 필터">
      {/* 고를 사람이 없으면 「전체」 하나뿐인 select는 할 수 없는 선택이라 칸째 숨긴다. */}
      {people.length > 0 ? (
        <div className={styles.selectLabel}>
          <label htmlFor="actorId">사람</label>
          <select
            id="actorId"
            name={ACTOR_KEY}
            className={styles.select}
            defaultValue={defaultValues.actorId ?? ""}
            onChange={() => formRef.current?.requestSubmit()}
          >
            <option value="">전체</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className={styles.selectLabel}>
        <label htmlFor="from">시작일</label>
        <input
          id="from"
          name={FROM_KEY}
          type="date"
          className={styles.dateInput}
          defaultValue={defaultValues.from ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        />
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="to">종료일</label>
        <input
          id="to"
          name={TO_KEY}
          type="date"
          className={styles.dateInput}
          defaultValue={defaultValues.to ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        />
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="actionType">행동 종류</label>
        <select
          id="actionType"
          name={ACTION_TYPE_KEY}
          className={styles.select}
          defaultValue={defaultValues.actionType ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">전체</option>
          {actionTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="documentId">문서 번호</label>
        <input
          id="documentId"
          name={DOCUMENT_KEY}
          type="text"
          className={styles.select}
          defaultValue={defaultValues.documentId ?? ""}
          onBlur={(event) => {
            // 값이 바뀌었을 때만 제출한다(프로젝트 필터와 같은 규칙) — 그대로 나가면 Tab이 다음 컨트롤로 간다.
            if (event.currentTarget.value !== (defaultValues.documentId ?? "")) formRef.current?.requestSubmit();
          }}
        />
      </div>

      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          name={INCLUDE_PRUNED_KEY}
          value="1"
          defaultChecked={defaultValues.includePruned ?? false}
          onChange={() => formRef.current?.requestSubmit()}
        />
        정리 포함
      </label>

      {hasFilter ? (
        <Link href="/admin/action-log" scroll={false} className={styles.toggle}>
          필터 지우기
        </Link>
      ) : null}
    </form>
  );
}

export type ActionLogFilterPayload = {
  actorId?: string;
  from?: string;
  to?: string;
  actionType?: string;
  documentId?: string;
  includePruned?: boolean;
};

// Excel 내보내기 — 화면 전환 없는 동작이라 실패는 §7-6 토스트로 알리고
// 부분 파일을 내려주지 않는다(직렬화가 끝난 뒤에만 응답이 온다).
// 07.1-05 D-7113(W13) — count는 page.tsx가 queryActionLog 결과 길이(rows.length)를 넘긴다 — 서버 exportActionLog가 거부를 판정하는 집합과 같은 수다.
// 정리 단추의 pruneCount(정리 가능 종류 · 정리 안 된 행만)는 더 작은 수라 쓰지 않는다.
const EXPORT_LIMIT = 5000;

export function ExportButton({ filter, count }: { filter: ActionLogFilterPayload; count: number }) {
  const tooMany = count > EXPORT_LIMIT;
  const [toast, setToast] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const { execute, isExecuting } = useAction(exportActionLogAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      // 서버가 붙인 BOM이 여기까지 온다고 믿지 않는다 — React Flight는 1024자
      // 이상 문자열을 별도 텍스트 청크로 보내고, 그 청크를 읽는 TextDecoder가
      // 맨 앞 U+FEFF를 떼어 낸다. BOM이 남는 건 짧은 파일뿐이라 실제 크기의
      // 로그는 Excel에서 한글이 깨진다. 없으면 여기서 다시 붙인다.
      const body = data.body.startsWith("\uFEFF") ? data.body : `\uFEFF${data.body}`;
      const blob = new Blob([body], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    // #319 P3 — 서버가 5,000건 상한 등으로 거부하면(UserFacingError) 그 문장을 그대로 보인다. 그 밖의 실패는 일반 문구.
    onError: ({ error }) => setToast({ message: error.serverError ?? "Excel 내보내기 · 실패 · 다시 시도", tone: "error" }),
  });
  const reasonId = useId();

  return (
    <>
      {/* #319 B-1 — 이유 줄을 Button 안(옆)에 두면 폰에서 단추를 눌러 좁혀 글자가 단추 밖으로 넘친다. 단추는 줄지 않고 이유는 모자라면 아랫줄로 내려가게
          줄바꿈 되는 묶음(confirmRow)에 단추와 이유를 따로 둔다 — 이유 글자 모양은 Button 이유(info)와 같은 confirmText. */}
      <span className={styles.confirmRow}>
        <Button variant="secondary" pending={isExecuting} disabled={tooMany} aria-describedby={tooMany ? reasonId : undefined} onClick={() => execute(filter)}>
          Excel 내보내기
        </Button>
        {tooMany ? (
          <span id={reasonId} className={styles.confirmText}>
            5,000건 넘음 · 기간이나 필터로 줄이기
          </span>
        ) : null}
      </span>
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}

// 정리 — 모달 컴포넌트가 없어(D-25) 두 단계 제출로 확인을 대신한다. 확인
// 줄 문구가 정리 기록이 남는다는 사실을 명시한다(03-UI-SPEC.md).
export function PruneControl({ filter, count }: { filter: ActionLogFilterPayload; count: number }) {
  const [confirming, setConfirming] = useState(false);
  const { execute, isExecuting, result } = useAction(pruneActionLogAction, {
    onSuccess: () => setConfirming(false),
  });

  if (!confirming) {
    return (
      <Button
        variant="tertiary"
        onClick={() => setConfirming(true)}
        disabled={count === 0}
        disabledReason={count === 0 ? "정리할 행이 없습니다" : undefined}
        reasonTone="info"
      >
        정리
      </Button>
    );
  }

  return (
    <span className={styles.confirmRow}>
      <span className={styles.confirmText}>{`${count}건을 정리합니다 · 정리 기록은 남습니다`}</span>
      <Button variant="primary" pending={isExecuting} onClick={() => execute(filter)}>
        정리
      </Button>
      <Button variant="secondary" onClick={() => setConfirming(false)}>
        취소
      </Button>
      {result.serverError ? <span className={styles.confirmError}>정리 실패 · 다시 시도</span> : null}
    </span>
  );
}
