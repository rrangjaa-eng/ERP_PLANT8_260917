"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { createRoleAction, renameRoleAction, setRoleWorkScopeAction, archiveRoleAction } from "../actions";
import type { RoleWorkScope } from "@/domain/permissions/roles";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import styles from "../people.module.css";

const NEW_HREF = "/admin/people/roles?new=1#role-form";

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

function RoleRow({ role, canArchive }: { role: RoleRowView; canArchive: boolean }) {
  const [name, setName] = useState(role.name);
  const { execute: executeRename, result: renameResult } = useAction(renameRoleAction);
  const [workScope, setWorkScope] = useState<RoleWorkScope>(role.workScope);
  const { execute: executeWorkScope, result: workScopeResult } = useAction(setRoleWorkScopeAction, {
    onError: () => setWorkScope(role.workScope),
  });

  return (
    <tr>
      <td>
        <input
          className={styles.select}
          aria-label={`${role.name} 이름`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() && name !== role.name) executeRename({ id: role.id, name });
          }}
        />
        {renameResult.serverError ? <p className={styles.registeredHint}>{renameResult.serverError}</p> : null}
      </td>
      <td>
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
        {workScopeResult.serverError ? <p className={styles.registeredHint}>{workScopeResult.serverError}</p> : null}
      </td>
      <td>{role.isSeed ? "시드" : "—"}</td>
      <td className={styles.num}>{role.sortOrder}</td>
      <td>
        {role.archivedAt ? (
          <StatusTag kind="muted" variant="text">
            보관됨
          </StatusTag>
        ) : null}
        {/* 03-07: 시드 계급·이미 보관된 계급은 버튼 자체가 없다(03-01의
            isProtected가 서버에서도 거부한다). 쓰기 권한이 없는 계급에도
            렌더하지 않는다. */}
        {!role.isSeed && !role.archivedAt && canArchive ? (
          <DeleteToArchive
            name={role.name}
            onArchive={async () => {
              const result = await archiveRoleAction({ id: role.id });
              if (result?.serverError) throw new Error(result.serverError);
            }}
          />
        ) : null}
      </td>
    </tr>
  );
}

// §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 폼은 ?new=1일 때만
// 렌더한다(design-review A-H1). 거래처·코드표·사람·법인카드 네 화면이 쓰는
// 것과 같은 토글이다.
export function RolesClient({
  roles,
  canArchive,
  showForm,
}: {
  roles: RoleRowView[];
  canArchive: boolean;
  showForm: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { execute, result, isExecuting } = useAction(createRoleAction, {
    onSuccess: () => formRef.current?.reset(),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({ name: getStringField(formData, "name") });
  }

  const nameError = result.validationErrors?.name?._errors?.[0];

  return (
    <>
      {showForm ? (
        <form ref={formRef} onSubmit={handleSubmit} id="role-form" className="single-column">
          <TextField id="role-name" name="name" label="이름" required error={nameError} />
          {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" pending={isExecuting}>
              계급 추가
            </Button>
            <Link href="/admin/people/roles" className={styles.toggle}>
              취소
            </Link>
          </div>
        </form>
      ) : roles.length > 0 ? (
        // 목록이 비면 §7-7 EMPTY가 같은 이름의 「다음 한 수」를 이미 보이므로
        // 이 줄은 없다 — 같은 링크를 두 번 그리지 않는다(접근 가능한 이름 중복).
        <div className={styles.filterRow}>
          <Link href={NEW_HREF} className={styles.toggle}>
            계급 추가
          </Link>
        </div>
      ) : null}

      {roles.length === 0 ? (
        <ListEmpty message="등록된 계급이 없습니다" action={{ label: "계급 추가", href: NEW_HREF }} />
      ) : (
      <table className={styles.table}>
        <caption className="sr-only">계급</caption>
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">업무 범위</th>
            <th scope="col">시드 여부</th>
            <th scope="col" className={styles.num}>정렬</th>
            <th scope="col">동작</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <RoleRow key={role.id} role={role} canArchive={canArchive} />
          ))}
        </tbody>
      </table>
      )}
    </>
  );
}
