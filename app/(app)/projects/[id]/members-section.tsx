"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ProjectMemberDto, ProjectMembersView } from "@/domain/projects/members";
import { listProjectMembersAction, removeProjectMemberAction, restoreProjectMemberAction } from "@/app/(app)/projects/actions";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StaticTable, type StaticTableColumn, type StaticTableRow } from "@/ui/table/StaticTable";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import { memberRemovedLine, memberUndoFailedLine } from "./member-words";
import styles from "./project-detail.module.css";

// 06.2-12(UI-SPEC S2): 프로젝트 상세 「참여자」 섹션 — 법인카드 사용 섹션처럼 따로 불러(액션) 실패해도 원장 · 매출 · 차수 섹션은 선다.
// 첫 행 = 담당 PM 읽기 행(서버 `pm`, 떼기 없음) · 이어서 참여자(붙인 순). 권리 · 잠금 · 후보 유무는 서버 불린만 그린다 — 클라이언트는 계산하지 않는다.
// 떼기는 확인 창 없이 바로 보관하고 표 위 결과 줄 `{이름} 뗌` + 3차 `되돌리기`(보관 해제, 마지막 한 명만 — cards/delete-undo.tsx 규칙).
// 서버 거부 줄은 섹션 클라이언트 상태라 다시 읽기 · router.refresh()로 지워지지 않고 사용자의 다음 조작이나 화면 이동까지 남는다.

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: ProjectMembersView };
type Member = { userId: string | null; name: string; teamName: string | null; retired: boolean; archived: boolean };
type ResultLine =
  | { kind: "removed"; userId: string; name: string; retryText: string | null }
  | { kind: "failed"; text: string; focus: boolean };

type SectionHandle = { reload: () => Promise<void>; dismissFailure: () => void };

type MembersContextValue = {
  projectId: string;
  projectName: string;
  /** 서버 페이지가 계산한 권리 — 읽기 전 뼈대의 열 수만 정한다(읽은 뒤에는 섹션 읽기의 값). */
  canEdit: boolean;
  registerSection: (handle: SectionHandle | null) => void;
};

const MembersContext = createContext<MembersContextValue | null>(null);

function useMembers(): MembersContextValue {
  const value = useContext(MembersContext);
  if (!value) throw new Error("ProjectMembersProvider 밖에서 참여자 화면을 그렸다");
  return value;
}

export function ProjectMembersProvider({
  projectId,
  projectName,
  canEdit,
  children,
}: {
  projectId: string;
  projectName: string;
  canEdit: boolean;
  children: ReactNode;
}) {
  const sectionRef = useRef<SectionHandle | null>(null);
  const registerSection = useCallback((handle: SectionHandle | null) => {
    sectionRef.current = handle;
  }, []);
  return <MembersContext.Provider value={{ projectId, projectName, canEdit, registerSection }}>{children}</MembersContext.Provider>;
}

function toMember(row: Partial<ProjectMemberDto>): Member {
  return { userId: row.userId ?? null, name: row.name ?? "—", teamName: row.teamName ?? null, retired: row.retired === true, archived: row.archived === true };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function NameCell({ member, pm }: { member: Member; pm: boolean }) {
  return (
    <span className={styles.memberName}>
      <span className={styles.memberNameText} title={member.name}>
        {member.name}
      </span>
      {pm ? <StatusTag status="담당 PM" variant="text" className={styles.memberTag} /> : null}
      {member.retired ? <StatusTag status="퇴직" variant="text" className={styles.memberTag} /> : null}
      {member.archived ? <StatusTag status="보관됨" variant="text" className={styles.memberTag} /> : null}
    </span>
  );
}

// 되돌려 다시 그려진 행이면 이 `떼기`가 포커스를 받고 표식을 지운다(다른 행이 다시 받지 않게 — 04.2 공휴일 `focusDate` 선례).
function RemoveAction({
  member,
  describedBy,
  pending,
  busy,
  focusId,
  clearFocus,
  onRemove,
}: {
  member: Member;
  describedBy: string;
  pending: boolean;
  busy: boolean;
  focusId: string | null;
  clearFocus: () => void;
  onRemove: () => void;
}) {
  const [restored] = useState(() => focusId !== null && focusId === member.userId);
  useEffect(() => {
    if (restored) clearFocus();
  }, [restored, clearFocus]);
  return (
    <RowActions>
      <RowAction danger pending={pending} busy={busy} autoFocus={restored} describedBy={describedBy} onClick={onRemove}>
        <span className="sr-only">{member.name}</span>떼기
      </RowAction>
    </RowActions>
  );
}

function SectionLoading({ canEdit }: { canEdit: boolean }) {
  return (
    <div aria-busy="true">
      <TableSkeleton
        columns={[
          { key: "name", label: "이름" },
          { key: "team", label: "팀" },
          ...(canEdit ? [{ key: "actions", label: "동작" }] : []),
        ]}
      />
    </div>
  );
}

export function MembersSection() {
  const { projectId, canEdit: serverCanEdit, registerSection } = useMembers();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [line, setLine] = useState<ResultLine | null>(null);
  // 새로 뗄 때마다 `되돌리기`를 다시 그려 포커스를 준다.
  const [shown, setShown] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const failedLineRef = useRef<HTMLSpanElement>(null);
  const clearFocus = useCallback(() => setFocusId(null), []);

  const fetchView = useCallback(async (): Promise<Load> => {
    try {
      const result = await listProjectMembersAction({ projectId });
      if (result?.data) return { kind: "ready", data: result.data };
    } catch {
      // 요청이 끊겨도 섹션 자리 한 줄로만 알린다(원장 무영향).
    }
    return { kind: "error" };
  }, [projectId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await fetchView();
      if (live) setLoad(next);
    })();
    return () => {
      live = false;
    };
  }, [fetchView, attempt]);

  // 조용한 다시 읽기 — 표를 뼈대로 되돌리지 않고 새 값으로 바꾼다. 그려진 뒤(다음 프레임)에 끝난다.
  const reload = useCallback(async () => {
    const next = await fetchView();
    setLoad(next);
    await nextFrame();
  }, [fetchView]);

  useEffect(() => {
    registerSection({ reload, dismissFailure: () => setLine((current) => (current?.kind === "failed" ? null : current)) });
    return () => registerSection(null);
  }, [registerSection, reload]);

  const focusFailedLine = line?.kind === "failed" && line.focus;
  useEffect(() => {
    if (focusFailedLine) failedLineRef.current?.focus();
  }, [focusFailedLine, line]);

  async function remove(member: Member) {
    const userId = member.userId;
    if (!userId) return;
    setLine((current) => (current?.kind === "failed" ? null : current));
    setFailedIds((ids) => ids.filter((id) => id !== userId));
    setPendingId(userId);
    let outcome: Awaited<ReturnType<typeof removeProjectMemberAction>> | undefined;
    try {
      outcome = await removeProjectMemberAction({ projectId, userId });
    } catch {
      outcome = undefined;
    }
    setPendingId(null);
    if (outcome?.data) {
      setLine({ kind: "removed", userId, name: member.name, retryText: null });
      setShown((count) => count + 1);
      await reload();
      return;
    }
    if (outcome?.serverError) {
      setLine({ kind: "failed", text: outcome.serverError, focus: false });
      await reload();
      router.refresh();
      return;
    }
    // 연결 실패 — 그 행 팀 칸 글자가 실패 줄로 바뀌고 `떼기`는 살아 있다.
    setFailedIds((ids) => [...ids, userId]);
  }

  async function undo(removed: { userId: string; name: string }) {
    setPendingId(removed.userId);
    let outcome: Awaited<ReturnType<typeof restoreProjectMemberAction>> | undefined;
    try {
      outcome = await restoreProjectMemberAction({ projectId, userId: removed.userId });
    } catch {
      outcome = undefined;
    }
    setPendingId(null);
    if (outcome?.data) {
      setLine(null);
      setFocusId(removed.userId);
      await reload();
      return;
    }
    if (outcome?.serverError) {
      setLine({ kind: "failed", text: memberUndoFailedLine(outcome.serverError), focus: true });
      await reload();
      router.refresh();
      return;
    }
    setLine({ kind: "removed", userId: removed.userId, name: removed.name, retryText: memberUndoFailedLine(null) });
  }

  if (load.kind === "loading") {
    return (
      <DetailScreen.Section title="참여자">
        <SectionLoading canEdit={serverCanEdit} />
      </DetailScreen.Section>
    );
  }

  if (load.kind === "error") {
    return (
      <DetailScreen.Section title="참여자">
        <ListEmpty
          tone="error"
          message="참여자 불러오지 못함"
          action={{
            label: "다시 시도",
            onClick: () => {
              setLoad({ kind: "loading" });
              setAttempt((value) => value + 1);
            },
          }}
        />
      </DetailScreen.Section>
    );
  }

  const { data } = load;
  const canEdit = data.canEdit;
  const columns: StaticTableColumn[] = [
    { key: "name", header: "이름", priority: "p1" },
    { key: "team", header: "팀", priority: "p2" },
    ...(canEdit ? [{ key: "actions", header: "동작", priority: "p1" } satisfies StaticTableColumn] : []),
  ];

  const members = data.rows.map(toMember);
  const pm = data.pm ? toMember(data.pm) : null;
  const tableRows: StaticTableRow[] = [
    ...(pm
      ? [
          {
            key: "pm",
            cells: [
              <NameCell key="name" member={pm} pm />,
              <span key="team" className={styles.memberTeamText} title={pm.teamName ?? undefined}>
                {pm.teamName ?? "—"}
              </span>,
              ...(canEdit ? [null] : []),
            ],
          } satisfies StaticTableRow,
        ]
      : []),
    ...members.map((member, index) => {
      const userId = member.userId;
      const failed = userId !== null && failedIds.includes(userId);
      const failId = `member-fail-${userId ?? index}`;
      return {
        key: userId ?? `row-${index}`,
        cells: [
          <NameCell key="name" member={member} pm={false} />,
          failed ? (
            <span key="team" id={failId} role="alert" className={`${styles.memberTeamText} ${styles.memberFail}`}>
              떼기 실패 · 다시 시도
            </span>
          ) : (
            <span key="team" className={styles.memberTeamText} title={member.teamName ?? undefined}>
              {member.teamName ?? "—"}
            </span>
          ),
          ...(canEdit
            ? [
                userId ? (
                  <RemoveAction
                    key="actions"
                    member={member}
                    describedBy={failId}
                    pending={pendingId === userId}
                    busy={pendingId !== null && pendingId !== userId}
                    focusId={focusId}
                    clearFocus={clearFocus}
                    onRemove={() => void remove(member)}
                  />
                ) : null,
              ]
            : []),
        ],
      } satisfies StaticTableRow;
    }),
  ];

  return (
    <DetailScreen.Section title="참여자">
      {line ? (
        <p role="status" className={styles.memberResult}>
          {line.kind === "failed" ? (
            <span ref={failedLineRef} tabIndex={line.focus ? -1 : undefined} className={styles.memberResultFailed}>
              {line.text}
            </span>
          ) : (
            <>
              {line.retryText ? <span className={styles.memberResultFailed}>{line.retryText}</span> : <span>{memberRemovedLine(line.name)}</span>}
              <RowAction key={shown} pending={pendingId === line.userId} autoFocus onClick={() => void undo(line)}>
                되돌리기
              </RowAction>
            </>
          )}
        </p>
      ) : null}
      <StaticTable caption="참여자" columns={columns} rows={tableRows} />
    </DetailScreen.Section>
  );
}
