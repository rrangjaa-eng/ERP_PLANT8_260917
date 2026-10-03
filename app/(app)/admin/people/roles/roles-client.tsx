"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  createRoleAction,
  renameRoleAction,
  setRoleWorkScopeAction,
  archiveRoleAction,
} from "../actions";
import type { RoleWorkScope } from "@/domain/permissions/roles";
import { TextField } from "@/ui/input/TextField";
import { Num } from "@/ui/num/Num";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable } from "@/ui/table/StaticTable";
import { RowActions } from "@/ui/row-actions/RowActions";
import { PcOnly } from "../../pc-only";
import { usePhoneWidth } from "@/app/(app)/leave/use-phone-width";
import styles from "../people.module.css";

export type RoleRowView = {
  id: string;
  name: string;
  isSeed: boolean;
  sortOrder: number;
  workScope: RoleWorkScope;
  archivedAt: Date | null;
};

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// 폰 P1은 이름 · 업무 범위 · 동작 3열(SYSTEM §7-3), 시드 여부 · 정렬은 접힌 줄이다(04.6 W1-4 B2·B3).
// 표는 `StaticTable`(R1 · M4)이다 — 편집 칸(이름 · 업무 범위)은 칸 노드로 들어가는 클라이언트 컴포넌트가 그대로 맡는다.
function RoleNameCell({ role }: { role: RoleRowView }) {
  const [name, setName] = useState(role.name);
  const { execute: executeRename, result: renameResult } =
    useAction(renameRoleAction);
  // 폰은 읽기만(사용자 결정 2026-10-03 14:57 KST 카드) — 입력 칸 없이 값만.
  if (usePhoneWidth()) return <>{role.name}</>;
  return (
    <>
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
    </>
  );
}

function RoleWorkScopeCell({ role }: { role: RoleRowView }) {
  const [workScope, setWorkScope] = useState<RoleWorkScope>(role.workScope);
  const { execute: executeWorkScope, result: workScopeResult } = useAction(
    setRoleWorkScopeAction,
    {
      onError: () => setWorkScope(role.workScope),
    },
  );
  if (usePhoneWidth()) return <>{role.workScope === "company" ? "전사" : "자기 팀"}</>;
  return (
    <>
      <select
        className={styles.select}
        aria-label={`${role.name} 업무 범위`}
        value={workScope}
        disabled={role.archivedAt !== null}
        onChange={(event) => {
          const next = event.target.value === "company" ? "company" : "team";
          setWorkScope(next);
          executeWorkScope({ id: role.id, workScope: next });
        }}
      >
        <option value="team">자기 팀</option>
        <option value="company">전사</option>
      </select>
      {workScopeResult.serverError ? (
        <p className={styles.registeredHint}>{workScopeResult.serverError}</p>
      ) : null}
    </>
  );
}

function RoleActionsCell({
  role,
  canArchive,
}: {
  role: RoleRowView;
  canArchive: boolean;
}) {
  return (
    <>
      {role.archivedAt ? <StatusTag status="보관됨" variant="text" /> : null}
      {/* 03-07: 시드 계급·이미 보관된 계급은 버튼 자체가 없다(03-01의
          isProtected가 서버에서도 거부한다). 쓰기 권한이 없는 계급에도
          렌더하지 않는다. */}
      {!role.isSeed && !role.archivedAt && canArchive ? (
        <PcOnly>
          <RowActions>
            <DeleteToArchive
              name={role.name}
              onArchive={async () => {
                const result = await archiveRoleAction({ id: role.id });
                if (result?.serverError) throw new Error(result.serverError);
              }}
            />
          </RowActions>
        </PcOnly>
      ) : null}
    </>
  );
}

export function RolesList({
  roles,
  canArchive,
}: {
  roles: RoleRowView[];
  canArchive: boolean;
}) {
  return (
    <div className={styles.rolesTable}>
      <StaticTable
        caption="계급"
        columns={[
          { key: "name", header: "이름", priority: "p1" },
          { key: "workScope", header: "업무 범위", priority: "p1" },
          { key: "seed", header: "시드 여부", priority: "p2" },
          { key: "sortOrder", header: "정렬", priority: "p2", align: "right" },
          { key: "actions", header: "동작", priority: "p1" },
        ]}
        rows={roles.map((role) => ({
          key: role.id,
          cells: [
            <RoleNameCell key="name" role={role} />,
            <RoleWorkScopeCell key="workScope" role={role} />,
            role.isSeed ? "시드" : "—",
            <Num key="sortOrder" value={role.sortOrder} unit="count" />,
            <RoleActionsCell
              key="actions"
              role={role}
              canArchive={canArchive}
            />,
          ],
        }))}
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
