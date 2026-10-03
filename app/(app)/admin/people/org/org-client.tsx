"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  createOrgUnitAction,
  renameOrgUnitAction,
  createTeamAction,
  renameTeamAction,
  archiveOrgUnitAction,
  archiveTeamAction,
} from "../actions";
import { TextField } from "@/ui/input/TextField";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import styles from "../people.module.css";

export const NEW_TEAM_BASE_HREF = "/admin/people/org?new=team";

export type OrgUnitView = { id: string; name: string; archivedAt: Date | null };
export type TeamView = { id: string; orgUnitId: string; name: string; archivedAt: Date | null };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function RenameInput({
  value,
  ariaLabel,
  onSave,
  error,
}: {
  value: string;
  ariaLabel: string;
  onSave: (name: string) => void;
  error?: string;
}) {
  const [name, setName] = useState(value);
  return (
    <>
      <input
        className={styles.select}
        aria-label={ariaLabel}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() && name !== value) onSave(name);
        }}
      />
      {error ? <p className={styles.registeredHint}>{error}</p> : null}
    </>
  );
}

function TeamRow({ team, canArchive }: { team: TeamView; canArchive: boolean }) {
  const { execute, result } = useAction(renameTeamAction);
  return (
    <li>
      <RenameInput
        value={team.name}
        ariaLabel={`${team.name} 이름`}
        onSave={(name) => execute({ id: team.id, name })}
        error={result.serverError}
      />
      {team.archivedAt ? (
        <StatusTag status="보관됨" variant="text" />
      ) : canArchive ? (
        <RowActions>
          <DeleteToArchive
            name={team.name}
            onArchive={async () => {
              const archiveResult = await archiveTeamAction({ id: team.id });
              if (archiveResult?.serverError) throw new Error(archiveResult.serverError);
            }}
          />
        </RowActions>
      ) : null}
    </li>
  );
}

function OrgUnitRow({
  orgUnit,
  teams,
  canArchive,
  canWrite,
}: {
  orgUnit: OrgUnitView;
  teams: TeamView[];
  canArchive: boolean;
  canWrite: boolean;
}) {
  const { execute, result } = useAction(renameOrgUnitAction);
  return (
    <li>
      <RenameInput
        value={orgUnit.name}
        ariaLabel={`${orgUnit.name} 이름`}
        onSave={(name) => execute({ id: orgUnit.id, name })}
        error={result.serverError}
      />
      {orgUnit.archivedAt ? (
        <StatusTag status="보관됨" variant="text" />
      ) : canWrite || canArchive ? (
        // DR3 B — 「팀 추가」는 보관되지 않은 본부 행마다 있는 행동 링크다(그 본부가 미리 골라진 팀 패널).
        <RowActions>
          {canWrite ? <RowAction href={`${NEW_TEAM_BASE_HREF}&orgUnitId=${orgUnit.id}`}>팀 추가</RowAction> : null}
          {canArchive ? (
            <DeleteToArchive
              name={orgUnit.name}
              onArchive={async () => {
                const archiveResult = await archiveOrgUnitAction({ id: orgUnit.id });
                if (archiveResult?.serverError) throw new Error(archiveResult.serverError);
              }}
            />
          ) : null}
        </RowActions>
      ) : null}
      <ul>
        {teams
          .filter((team) => team.orgUnitId === orgUnit.id)
          .map((team) => (
            <TeamRow key={team.id} team={team} canArchive={canArchive} />
          ))}
      </ul>
    </li>
  );
}


// 목록 — 본부 행마다 본부 · 팀 이름 변경과 행동(「팀 추가」 · 「삭제」).
export function OrgList({
  orgUnits,
  teams,
  canArchive,
  canWrite,
}: {
  orgUnits: OrgUnitView[];
  teams: TeamView[];
  canArchive: boolean;
  canWrite: boolean;
}) {
  return (
    <ul>
      {orgUnits.map((org) => (
        <OrgUnitRow key={org.id} orgUnit={org} teams={teams} canArchive={canArchive} canWrite={canWrite} />
      ))}
    </ul>
  );
}

// §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 폼은 page.tsx가 ?new=org·?new=team일 때만,
// 그것도 한 번에 하나만 옆 패널로 렌더한다(design-review A-H1). 성공 뒤(UQ-8 B)는 `PanelForm`이 칸을 비우고 첫 칸에 포커스를 준다.
export function OrgUnitForm() {
  const panelRef = useRef<PanelFormHandle>(null);
  const { execute, result, isExecuting } = useAction(createOrgUnitAction, {
    onSuccess: () => panelRef.current?.succeed({ status: "본부 추가됨" }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({ name: getStringField(formData, "name") });
  }

  return (
    <PanelForm
      ref={panelRef}
      id="org-unit-form"
      label="본부 추가"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={result.serverError ?? null}
    >
      <TextField
        id="org-unit-name"
        name="name"
        label="이름"
        required
        error={result.validationErrors?.name?._errors?.[0]}
      />
    </PanelForm>
  );
}

// DR3 B — `defaultOrgUnitId`는 서버가 보관되지 않은 본부와 맞춰 본 값만 온다(없거나 모르면 빈 값 「본부 선택」).
export function TeamForm({ orgUnits, defaultOrgUnitId }: { orgUnits: OrgUnitView[]; defaultOrgUnitId: string }) {
  const panelRef = useRef<PanelFormHandle>(null);
  const { execute, result, isExecuting } = useAction(createTeamAction, {
    onSuccess: () => panelRef.current?.succeed({ status: "팀 추가됨" }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      orgUnitId: getStringField(formData, "orgUnitId"),
      name: getStringField(formData, "name"),
    });
  }

  return (
    <PanelForm
      ref={panelRef}
      id="team-form"
      label="팀 추가"
      intent="create"
      onSubmit={handleSubmit}
      pending={isExecuting}
      reason={result.serverError ?? null}
    >
      <div className={styles.panelSelect}>
        <label htmlFor="team-org-unit-id">본부</label>
        <select className={styles.select} id="team-org-unit-id" name="orgUnitId" required defaultValue={defaultOrgUnitId}>
          <option value="" disabled>
            본부 선택
          </option>
          {orgUnits.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      <TextField
        id="team-name"
        name="name"
        label="이름"
        required
        error={result.validationErrors?.name?._errors?.[0]}
      />
    </PanelForm>
  );
}
