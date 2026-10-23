"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  createRoleAction,
  renameRoleAction,
  setRoleWorkScopeAction,
  setRoleViewScopeAction,
  archiveRoleAction,
} from "../actions";
import type { RoleViewScope, RoleWorkScope } from "@/domain/permissions/roles";
import type { RoleRowControls } from "./role-row-controls";
import { TextField } from "@/ui/input/TextField";
import { Num } from "@/ui/num/Num";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { ArchiveRejectedError, DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { PcOnly, PhoneOnly } from "../../pc-only";
import styles from "../people.module.css";

// domain/permissions/roles.ts는 DB를 불러 클라이언트 번들에 넣을 수 없다 — 낱말만 이 표에 두고, 선택지는 서버 판정(role-row-controls)이 ROLE_VIEW_SCOPES 순서로 넘긴다.
const VIEW_SCOPE_LABEL: Record<RoleViewScope, string> = { company: "전사", org_unit: "본부", team: "팀", own: "본인" };
const WORK_SCOPE_LABEL: Record<RoleWorkScope, string> = { team: "자기 팀", company: "전사" };
// 07-21(개정 10): 줄 판정이 없으면 fail-closed — 이름 · 범위는 글자, `삭제` 없음.
const LOCKED_ROW: RoleRowControls = { editable: false, workScopes: null, viewScopes: null };

export type RoleRowView = {
  id: string;
  name: string;
  isSeed: boolean;
  sortOrder: number;
  workScope: RoleWorkScope;
  viewScope: RoleViewScope;
  archivedAt: Date | null;
};

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// 폰 P1은 이름 · 업무 범위 · 동작 3열(SYSTEM §7-3), 시드 여부 · 정렬은 접힌 줄이다(04.6 W1-4 B2·B3).
// 표는 `StaticTable`(R1 · M4)이다 — 편집 칸(이름 · 업무 범위)은 칸 노드로 들어가는 클라이언트 컴포넌트가 그대로 맡는다.
function RoleNameCell({ role, canWrite }: { role: RoleRowView; canWrite: boolean }) {
  const [name, setName] = useState(role.name);
  const { execute: executeRename, result: renameResult } =
    useAction(renameRoleAction);
  // 06.2 PR-6 R-1(사용자 결정 2026-10-09 「글자로」): 쓰기 권한이 없으면 입력 칸 대신 글자(서버가 거부해 값이 되돌아가던 칸).
  if (!canWrite) return <>{role.name}</>;
  // 폰은 읽기만(사용자 결정 2026-10-03 14:57 KST 카드) — 입력 칸은 폰에서 CSS로 숨고 값만 보인다.
  return (
    <>
      <PhoneOnly>{role.name}</PhoneOnly>
      <PcOnly>
        <input
          className={styles.select}
          aria-label={`${role.name} 이름`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() && name !== role.name)
              executeRename({ id: role.id, name });
          }}
        />
        {renameResult.serverError ? (
          <p className={styles.registeredHint}>{renameResult.serverError}</p>
        ) : null}
      </PcOnly>
    </>
  );
}

// 07-21(R14 · 개정 10): select 선택지는 서버가 받는 값(`scopes`)뿐 — 하나 이하면 글자(비활성 select 아님).
function RoleWorkScopeCell({ role, scopes }: { role: RoleRowView; scopes: RoleWorkScope[] | null }) {
  const [workScope, setWorkScope] = useState<RoleWorkScope>(role.workScope);
  const { execute: executeWorkScope, result: workScopeResult } = useAction(
    setRoleWorkScopeAction,
    {
      onError: () => setWorkScope(role.workScope),
    },
  );
  if (!scopes) return <>{WORK_SCOPE_LABEL[role.workScope]}</>;
  return (
    <>
      <PhoneOnly>{WORK_SCOPE_LABEL[role.workScope]}</PhoneOnly>
      <PcOnly>
        <select
          className={styles.select}
          aria-label={`${role.name} 업무 범위`}
          value={workScope}
          disabled={role.archivedAt !== null}
          onChange={(event) => {
            const next = scopes.find((scope) => scope === event.target.value);
            if (!next) return;
            setWorkScope(next);
            executeWorkScope({ id: role.id, workScope: next });
          }}
        >
          {scopes.map((scope) => (
            <option key={scope} value={scope}>
              {WORK_SCOPE_LABEL[scope]}
            </option>
          ))}
        </select>
        {workScopeResult.serverError ? (
          <p className={styles.registeredHint}>{workScopeResult.serverError}</p>
        ) : null}
      </PcOnly>
    </>
  );
}

// 06.2-09(S1 · D-6201): 보는 범위 — 업무 범위 칸과 같은 즉시 저장(확인 · 저장 버튼 · 지연 표시 없음, SYSTEM §7-13 06.2 보강).
// 폰 접힌 줄은 라벨 없이 값만이라 `보기 {낱말}`로 업무 범위 값과 가른다(UI-SPEC S1 · design I8). 선택지 낱말에는 접두가 없다.

function RoleViewScopeCell({ role, scopes }: { role: RoleRowView; scopes: RoleViewScope[] | null }) {
  const [viewScope, setViewScope] = useState<RoleViewScope>(role.viewScope);
  // 서버 오류도 연결 실패(요청 끊김)도 같은 한 줄 — 연결 실패는 serverError가 없어 기본 문구.
  const { execute: executeViewScope, result: viewScopeResult, hasErrored } = useAction(setRoleViewScopeAction, {
    onError: () => setViewScope(role.viewScope),
  });
  // 폰 접힌 줄 글자(`보기 {낱말}`)는 그대로, PC는 낱말만 글자로.
  if (!scopes)
    return (
      <>
        <PhoneOnly>{`보기 ${VIEW_SCOPE_LABEL[role.viewScope]}`}</PhoneOnly>
        <PcOnly>{VIEW_SCOPE_LABEL[role.viewScope]}</PcOnly>
      </>
    );
  return (
    <>
      <PhoneOnly>{`보기 ${VIEW_SCOPE_LABEL[role.viewScope]}`}</PhoneOnly>
      <PcOnly>
        <select
          className={styles.select}
          aria-label={`${role.name} 보는 범위`}
          value={viewScope}
          disabled={role.archivedAt !== null}
          onChange={(event) => {
            const next = scopes.find((scope) => scope === event.target.value);
            if (!next) return;
            setViewScope(next);
            executeViewScope({ id: role.id, viewScope: next });
          }}
        >
          {scopes.map((scope) => (
            <option key={scope} value={scope}>
              {VIEW_SCOPE_LABEL[scope]}
            </option>
          ))}
        </select>
        {hasErrored ? <p className={styles.registeredHint}>{viewScopeResult.serverError ?? "저장 실패 · 다시 시도"}</p> : null}
      </PcOnly>
    </>
  );
}

function RoleActionsCell({
  role,
  canArchive,
  memberCount,
}: {
  role: RoleRowView;
  canArchive: boolean;
  memberCount: number;
}) {
  return (
    <>
      {role.archivedAt ? <StatusTag status="보관됨" variant="text" /> : null}
      {/* 03-07: 시드 계급·이미 보관된 계급은 버튼 자체가 없다(03-01의
          isProtected가 서버에서도 거부한다). 쓰기 권한이 없는 계급에도
          렌더하지 않는다. */}
      {!role.isSeed && !role.archivedAt && canArchive ? (
        <RowActions>
          {memberCount > 0 ? (
            // 07-21(R17 화면 · K14 · SC-09 = SC-13 꼴): 소속이 남은 계급의 `삭제`는 비활성 + 같은 줄 이유 — 창을 열지 않는다(서버 07-15도 거부).
            <RowAction
              danger
              disabled
              disabledReason={
                <>
                  {"소속 "}
                  <Link href={`/admin/people?role=${role.id}`}>{`${memberCount}명`}</Link>
                  {" · 먼저 다른 계급으로 옮기기"}
                </>
              }
              onClick={() => {}}
            >
              삭제
            </RowAction>
          ) : (
            // N4: 성공 결과는 이 줄이 목록에서 빠지는 것(토스트 없음) — 되돌리기는 보관함 `복원`. 경합 거부는 서버 문구 그대로.
            <DeleteToArchive
              name={role.name}
              onArchive={async () => {
                const result = await archiveRoleAction({ id: role.id });
                if (result?.serverError) throw new ArchiveRejectedError(result.serverError);
              }}
            />
          )}
        </RowActions>
      ) : null}
    </>
  );
}

export function RolesList({
  roles,
  canArchive,
  canWrite,
  viewerRoleId,
  controls,
  memberCounts,
}: {
  roles: RoleRowView[];
  canArchive: boolean;
  canWrite: boolean;
  viewerRoleId: string | null;
  controls: Readonly<Record<string, RoleRowControls>>;
  memberCounts: Readonly<Record<string, number>>;
}) {
  return (
    <div className={styles.rolesTable}>
      <StaticTable
        editable={canWrite}
        caption="계급"
        columns={[
          { key: "name", header: "이름", priority: "p1" },
          { key: "workScope", header: "업무 범위", priority: "p1" },
          { key: "viewScope", header: "보는 범위", priority: "p2" },
          { key: "seed", header: "시드 여부", priority: "p2" },
          { key: "sortOrder", header: "정렬", priority: "p2", align: "right" },
          { key: "actions", header: "동작", priority: "p1" },
        ]}
        rows={roles.map((role) => {
          const row = controls[role.id] ?? LOCKED_ROW;
          // 06.2 CSO-1 R-1(사용자 결정 2026-10-08 「막기」): 자기 계급의 범위 두 칸은 서버가 거부하므로 글자 — 이름 칸은 그대로.
          const scopesOpen = canWrite && role.id !== viewerRoleId;
          return {
            key: role.id,
            cells: [
              <RoleNameCell key="name" role={role} canWrite={canWrite && row.editable} />,
              <RoleWorkScopeCell key="workScope" role={role} scopes={scopesOpen ? row.workScopes : null} />,
              <RoleViewScopeCell key="viewScope" role={role} scopes={scopesOpen ? row.viewScopes : null} />,
              role.isSeed ? "시드" : "—",
              <Num key="sortOrder" value={role.sortOrder} unit="count" />,
              // 07-21(R16 화면): 상한 밖 줄은 `삭제`도 그리지 않는다 — 서버(07-15)가 같은 판정으로 거부한다.
              <RoleActionsCell
                key="actions"
                role={role}
                canArchive={canArchive && row.editable}
                memberCount={memberCounts[role.id] ?? 0}
              />,
            ],
          };
        })}
      />
    </div>
  );
}

// §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 폼은 page.tsx가 ?new=1일 때만 옆 패널로 렌더한다
// (design-review A-H1). 성공 뒤(UQ-8 B)는 `PanelForm`이 칸을 비우고 첫 칸에 포커스를 준다.
export function RoleForm() {
  const panelRef = useRef<PanelFormHandle>(null);
  const { execute, result, isExecuting } = useAction(createRoleAction, {
    onSuccess: () => panelRef.current?.succeed({ status: "계급 추가됨" }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({ name: getStringField(formData, "name") });
  }

  return (
    <PanelForm
      ref={panelRef}
      id="role-form"
      label="계급 추가"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={result.serverError ?? null}
    >
      <TextField
        id="role-name"
        name="name"
        label="이름"
        required
        error={result.validationErrors?.name?._errors?.[0]}
      />
    </PanelForm>
  );
}
