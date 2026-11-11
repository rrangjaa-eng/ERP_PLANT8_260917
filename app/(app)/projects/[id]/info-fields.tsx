"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { INFO_MONEY_LOCKED, INFO_PM_NOT_MEMBER, pmEligible, type InfoField, type InfoFieldError, type InfoValues } from "@/domain/projects/info-rules";
import type { InfoEditCandidates } from "@/domain/projects/info";
import styles from "./project-detail.module.css";

// 07.2-17(S3 · DC-9 · D-7217~7220) — 정보 면 `기본` 칸의 행사명 · 고객사 · 담당 팀 · 담당 PM. 기간 · PO와 같은 `고치기` 묶음에서 열리고
// 화면 1차 「일괄 저장」의 N에 합류한다(같은 트랜잭션). 값 · dirty · 오류는 QuoteLedger가 갖고 이 컴포넌트는 그리기와 키만 맡는다.
// PM 후보의 고를 수 있음은 서버와 같은 순수 판정(pmEligible) — 서버가 잠근 tx에서 다시 잰다.

export type InfoNames = { client: string | null; team: string | null; pm: string | null };

export type InfoProps = {
  values: InfoValues;
  /** 지금 값의 이름(볼 수 없으면 null — `—`). */
  names: InfoNames;
  /** 서버 판정(infoEditRights) — `none`이면 4칸 읽기 전용. */
  rights: "edit" | "none";
  /** 돈 문서가 붙어 고객사 · 담당 팀을 바꿀 수 없다(D-7219). */
  moneyLocked: boolean;
  /** 고칠 권리가 있을 때만 — 고객사 · 팀(업무 범위) · PM(오늘 소속 · 참여). */
  candidates: InfoEditCandidates | null;
  /** 화면이 읽은 projects.version(D-7220 동시 수정). */
  version: number;
};

type PickKind = "client" | "team" | "pm";

const PICK_LIMIT = 50;
const PM_NOT_IN_TEAM = "담당 팀 소속 아님";

export function infoDirtyCount(draft: InfoValues | null, base: InfoValues): number {
  if (!draft) return 0;
  return (["name", "clientId", "teamId", "pmUserId"] as const).filter((key) => draft[key] !== base[key]).length;
}

// 팀이나 PM을 바꿨는데 PM이 새 팀 소속도 참여자도 아니면 저장 전에 PM 칸 오류를 그린다(서버와 같은 문구 · 같은 판정).
export function localInfoErrors(draft: InfoValues | null, base: InfoValues, candidates: InfoEditCandidates | null): InfoFieldError[] {
  if (!draft || !candidates) return [];
  if (draft.teamId === base.teamId && draft.pmUserId === base.pmUserId) return [];
  const pm = candidates.pmUsers.find((user) => user.id === draft.pmUserId);
  if (pm && pmEligible({ teamIdAfter: draft.teamId, memberTeamId: pm.memberTeamId, participant: pm.participant })) return [];
  return [{ field: "pm", reason: INFO_PM_NOT_MEMBER }];
}

function nameOf(kind: PickKind, id: string, base: InfoValues, names: InfoNames, candidates: InfoEditCandidates | null): string | null {
  if (kind === "client") return candidates?.clients.find((row) => row.id === id)?.name ?? (id === base.clientId ? names.client : null);
  if (kind === "team") return candidates?.teams.find((row) => row.id === id)?.name ?? (id === base.teamId ? names.team : null);
  return candidates?.pmUsers.find((row) => row.id === id)?.name ?? (id === base.pmUserId ? names.pm : null);
}

const FIELD_OF: Record<PickKind, keyof InfoValues> = { client: "clientId", team: "teamId", pm: "pmUserId" };
const ERROR_FIELD_OF: Record<PickKind, InfoField> = { client: "client", team: "team", pm: "pm" };
const LABEL_OF: Record<PickKind, string> = { client: "고객사", team: "담당 팀", pm: "담당 PM" };

// 읽기 — 정보 면 `기본` 칸 꼴 4행(값만).
export function InfoRows({ base, names }: { base: InfoValues; names: InfoNames }) {
  const rows: [string, string | null][] = [
    ["행사명", base.name],
    ["고객사", names.client],
    ["담당 팀", names.team],
    ["담당 PM", names.pm],
  ];
  return rows.map(([label, value]) => (
    <p key={label} className={styles.infoItem}>
      <span className={styles.infoLabel}>{label}</span>
      {value ? <span className={styles.infoValue}>{value}</span> : <span className={styles.infoNone}>—</span>}
    </p>
  ));
}

export function InfoFields({
  draft,
  base,
  names,
  candidates,
  moneyLocked,
  errors,
  saved,
  onChange,
  onEscape,
  onSave,
  saveLocked = false,
}: {
  draft: InfoValues;
  base: InfoValues;
  names: InfoNames;
  candidates: InfoEditCandidates | null;
  moneyLocked: boolean;
  /** 서버 칸 오류 + 화면 PM 판정(필드마다 하나). */
  errors: InfoFieldError[];
  saved: boolean;
  onChange: (next: InfoValues) => void;
  onEscape: () => void;
  onSave: () => void;
  saveLocked?: boolean;
}) {
  const [picking, setPicking] = useState<PickKind | null>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saveLocked) onEscape();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
    }
  }

  const search = useCallback(
    (query: string): Promise<PickResult | null> => {
      if (!picking || !candidates) return Promise.resolve(null);
      const needle = query.trim().toLowerCase();
      const current = draft[FIELD_OF[picking]];
      const pool: { id: string; name: string; selectable: boolean }[] =
        picking === "pm"
          ? candidates.pmUsers.map((user) => ({
              id: user.id,
              name: user.name,
              selectable: pmEligible({ teamIdAfter: draft.teamId, memberTeamId: user.memberTeamId, participant: user.participant }),
            }))
          : (picking === "client" ? candidates.clients : candidates.teams).map((row) => ({ ...row, selectable: true }));
      const matched = pool.filter((row) => needle === "" || row.name.toLowerCase().includes(needle));
      return Promise.resolve({
        items: matched.slice(0, PICK_LIMIT).map(
          (row): PickRow => ({ type: "row", id: row.id, title: row.name, selectable: row.selectable, reason: row.selectable ? null : PM_NOT_IN_TEAM, current: row.id === current }),
        ),
        truncated: matched.length > PICK_LIMIT,
      });
    },
    [picking, candidates, draft],
  );

  const errorOf = (field: InfoField) => errors.find((error) => error.field === field);
  const nameError = errorOf("name");

  function pickRow(kind: PickKind) {
    const id = `info-${kind}`;
    const field = FIELD_OF[kind];
    const dirty = draft[field] !== base[field];
    const error = errorOf(ERROR_FIELD_OF[kind]);
    const locked = moneyLocked && kind !== "pm";
    const name = nameOf(kind, draft[field], base, names, candidates);
    return (
      <Form.Field key={kind} id={id} label={LABEL_OF[kind]} width="long">
        <span className={dirty ? `${styles.infoPick} ${styles.infoPickDirty}` : styles.infoPick}>
          {name ? <span className={styles.infoValue}>{name}</span> : <span className={styles.infoNone}>—</span>}
          {locked ? null : (
            <Button
              id={id}
              type="button"
              variant="tertiary"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onClick={() => {
                if (!saveLocked) setPicking(kind);
              }}
            >
              바꾸기
            </Button>
          )}
        </span>
        {error ? <Form.Error id={`${id}-error`}>{error.reason}</Form.Error> : null}
      </Form.Field>
    );
  }

  return (
    <Form className={saved ? `${styles.periodForm} ${styles.periodSaved}` : styles.periodForm} onSubmit={(event) => event.preventDefault()}>
      <Form.Field id="info-name" label="행사명" width="long">
        <input
          id="info-name"
          type="text"
          autoComplete="off"
          value={draft.name}
          readOnly={saveLocked}
          aria-invalid={nameError ? "true" : undefined}
          aria-describedby={nameError ? "info-name-error" : undefined}
          className={draft.name !== base.name ? `${styles.periodInput} ${styles.periodInputDirty}` : styles.periodInput}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          onKeyDown={handleKeyDown}
        />
        {nameError ? <Form.Error id="info-name-error">{nameError.reason}</Form.Error> : null}
      </Form.Field>
      {pickRow("client")}
      {pickRow("team")}
      {pickRow("pm")}
      {moneyLocked ? <p className={styles.infoAux}>{INFO_MONEY_LOCKED}</p> : null}
      {picking ? (
        <PickDialog
          open
          onClose={() => setPicking(null)}
          title={`${LABEL_OF[picking]} 바꾸기`}
          searchLabel={`${LABEL_OF[picking]} 검색`}
          search={search}
          primaryLabel={picking === "client" ? "이 고객사로" : picking === "team" ? "이 팀으로" : "이 사람으로"}
          noun={picking === "client" ? "거래처" : picking === "team" ? "팀" : "사람"}
          onPick={(row: PickRow) => {
            const kind = picking;
            setPicking(null);
            onChange({ ...draft, [FIELD_OF[kind]]: row.id });
          }}
        />
      ) : null}
    </Form>
  );
}
