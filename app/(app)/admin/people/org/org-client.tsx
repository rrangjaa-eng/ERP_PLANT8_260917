"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  createOrgUnitAction,
  renameOrgUnitAction,
  createTeamAction,
  renameTeamAction,
} from "../actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import styles from "../people.module.css";

export type OrgUnitView = { id: string; name: string };
export type TeamView = { id: string; orgUnitId: string; name: string };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function RenameInput({
  value,
  onSave,
  error,
}: {
  value: string;
  onSave: (name: string) => void;
  error?: string;
}) {
  const [name, setName] = useState(value);
  return (
    <>
      <input
        className={styles.select}
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

function TeamRow({ team }: { team: TeamView }) {
  const { execute, result } = useAction(renameTeamAction);
  return (
    <li>
      <RenameInput
        value={team.name}
        onSave={(name) => execute({ id: team.id, name })}
        error={result.serverError}
      />
    </li>
  );
}

function OrgUnitRow({ orgUnit, teams }: { orgUnit: OrgUnitView; teams: TeamView[] }) {
  const { execute, result } = useAction(renameOrgUnitAction);
  return (
    <li>
      <RenameInput value={orgUnit.name} onSave={(name) => execute({ id: orgUnit.id, name })} error={result.serverError} />
      <ul>
        {teams
          .filter((team) => team.orgUnitId === orgUnit.id)
          .map((team) => (
            <TeamRow key={team.id} team={team} />
          ))}
      </ul>
    </li>
  );
}

export function OrgClient({ orgUnits, teams }: { orgUnits: OrgUnitView[]; teams: TeamView[] }) {
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
          <OrgUnitRow key={org.id} orgUnit={org} teams={teams} />
        ))}
      </ul>
    </>
  );
}
