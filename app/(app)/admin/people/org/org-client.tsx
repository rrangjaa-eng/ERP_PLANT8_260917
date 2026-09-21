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
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import styles from "../people.module.css";

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
        <StatusTag kind="muted" variant="text">
          보관됨
        </StatusTag>
      ) : canArchive ? (
        <DeleteToArchive
          name={team.name}
          onArchive={async () => {
            const archiveResult = await archiveTeamAction({ id: team.id });
            if (archiveResult?.serverError) throw new Error(archiveResult.serverError);
          }}
        />
      ) : null}
    </li>
  );
}

function OrgUnitRow({
  orgUnit,
  teams,
  canArchive,
}: {
  orgUnit: OrgUnitView;
  teams: TeamView[];
  canArchive: boolean;
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
        <StatusTag kind="muted" variant="text">
          보관됨
        </StatusTag>
      ) : canArchive ? (
        <DeleteToArchive
          name={orgUnit.name}
          onArchive={async () => {
            const archiveResult = await archiveOrgUnitAction({ id: orgUnit.id });
            if (archiveResult?.serverError) throw new Error(archiveResult.serverError);
          }}
        />
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

export function OrgClient({
  orgUnits,
  teams,
  canArchive,
}: {
  orgUnits: OrgUnitView[];
  teams: TeamView[];
  canArchive: boolean;
}) {
  const orgFormRef = useRef<HTMLFormElement>(null);
  const teamFormRef = useRef<HTMLFormElement>(null);

  const { execute: executeCreateOrgUnit, result: orgResult, isExecuting: creatingOrgUnit } = useAction(
    createOrgUnitAction,
    { onSuccess: () => orgFormRef.current?.reset() },
  );
  const { execute: executeCreateTeam, result: teamResult, isExecuting: creatingTeam } = useAction(createTeamAction, {
    onSuccess: () => teamFormRef.current?.reset(),
  });

  function handleOrgSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    executeCreateOrgUnit({ name: getStringField(formData, "name") });
  }

  function handleTeamSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    executeCreateTeam({
      orgUnitId: getStringField(formData, "orgUnitId"),
      name: getStringField(formData, "name"),
    });
  }

  return (
    <>
      <form ref={orgFormRef} onSubmit={handleOrgSubmit} id="org-unit-form">
        <TextField
          id="org-unit-name"
          name="name"
          label="이름"
          required
          error={orgResult.validationErrors?.name?._errors?.[0]}
        />
        {orgResult.serverError ? <FormAlert>{orgResult.serverError}</FormAlert> : null}
        <Button type="submit" variant="primary" pending={creatingOrgUnit}>
          본부 추가
        </Button>
      </form>

      <form ref={teamFormRef} onSubmit={handleTeamSubmit} id="team-form">
        <div className={styles.selectLabel}>
          <label htmlFor="team-org-unit-id">본부</label>
          <select className={styles.select} id="team-org-unit-id" name="orgUnitId" required defaultValue="">
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
          error={teamResult.validationErrors?.name?._errors?.[0]}
        />
        {teamResult.serverError ? <FormAlert>{teamResult.serverError}</FormAlert> : null}
        <Button type="submit" variant="primary" pending={creatingTeam}>
          팀 추가
        </Button>
      </form>

      <ul>
        {orgUnits.map((org) => (
          <OrgUnitRow key={org.id} orgUnit={org} teams={teams} canArchive={canArchive} />
        ))}
      </ul>
    </>
  );
}
