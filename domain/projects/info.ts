import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { denyWrite } from "@/domain/rules/deny-write";
import { coversProjectTeam, ForbiddenError, loadActorTeamScope, teamScopeForProject, type ActorTeamScope } from "@/domain/projects/status";
import { projectRowScope } from "@/domain/projects/visibility";
import { countMoneyAttachments } from "@/domain/projects/money-attachment";
import {
  infoEditRights,
  pmEligible,
  validateInfoChange,
  type InfoField,
  type InfoFieldError,
  type InfoRights,
  type InfoValues,
} from "@/domain/projects/info-rules";
import { listProjectFormReferences, type ProjectReferenceOption } from "@/domain/projects/references";
import { NOT_CLIENT_VENDOR, servesSide } from "@/domain/vendors/kind";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstDateTimeOf } from "@/lib/kst-date";
import type { DbOrTx } from "@/repositories/document-counters";
import { updateProjectInfoIfVersion, type ProjectRow } from "@/repositories/projects";
import { findLiveMemberUserIds } from "@/repositories/project-members";
import { findMembershipAtDate, findMembershipsAtDate } from "@/repositories/team-memberships";
import { findTeamById } from "@/repositories/teams";
import { findUserById } from "@/repositories/users";
import { findVendorById, findVendorKindsByIds } from "@/repositories/vendors";
import { readCustomFieldInputs } from "@/domain/custom-fields/access";
import { CustomFieldsInvalidError, resolveCustomFieldsWrite } from "@/domain/custom-fields/preserve";
import { pickVisibleCustomFields } from "@/domain/custom-fields/visibility";

// 07.2-17(PU5 · D-7217~D-7220) — 정보 면 4칸 쓰기. 합성 저장(saveProjectLedger)의 잠근 tx 안에서 applyInfoChange를 부른다 —
// 권리 → version(동시 수정) → 돈 문서 잠김 · 팀 범위 · 고객사 갈래 · PM 자격 → 칸 오류가 있으면 쓰지 않고 돌려준다(기간 · PO 오류와
// 모아 한 번에 거부 · U-6) → 없으면 조건부 갱신. 판정 순수 함수는 info-rules.ts(화면과 같이 부른다).

// 07.5-02(D-7506) — customFields는 고친 추가 칸만(키 없음 = 안 바꿈 · 빈 값 = 비움).
export type InfoInput = {
  name?: string;
  clientId?: string;
  teamId?: string;
  pmUserId?: string;
  customFields?: Record<string, unknown>;
  baselineVersion: number;
};

// 07.5-02 — 추가 칸 오류는 `customFields.<key>` 칸으로 4칸 오류와 같은 목록에 싣는다(전부 저장 또는 전부 거부).
export type InfoChangeFieldError = InfoFieldError | { field: `customFields.${string}`; reason: string };

// 트랜잭션 전 사실(잠근 tx 안에서 풀 db를 부르지 않는다 — 04-32). 범위는 합성 저장의 쓰기 범위 그대로(fundOnly 갈래는 들어오지 않는다).
export type InfoFacts = {
  canEditInfo: boolean;
  teamScope: ActorTeamScope;
  todayKst: string;
  // 바꾸려는 고객사의 보관 여부(갈래는 tx 안에서 잠가 읽는다 — createProject와 같은 꼴). 고객사를 싣지 않았으면 null.
  clientArchived: boolean | null;
};

export const INFO_RULE = "projects.info";
const TEAM_OUT_OF_SCOPE = "담당 팀 범위 밖 · 팀 다시 고르기";

// 동시 수정 — 잠근 행의 updated_at(KST HH:mm). 기간 · PO 저장도 그 시각을 올리므로 시각과 원인이 어긋날 수 있다(SUMMARY).
export class InfoConflictError extends UserFacingError {}

export function infoConflictMessage(updatedAt: Date): string {
  return `다른 사람이 ${kstDateTimeOf(updatedAt).slice(11)}에 바꿈 · 새로 고침`;
}

export async function loadInfoFacts(
  viewer: Viewer,
  input: InfoInput,
  facts: { canEditInfo: boolean; teamScope: ActorTeamScope; todayKst: string },
): Promise<InfoFacts> {
  const client = input.clientId ? await findVendorById(viewer, input.clientId) : null;
  return { ...facts, clientArchived: input.clientId ? (client === null || client.archivedAt !== null) : null };
}

export type InfoChangeResult =
  | { ok: false; errors: InfoChangeFieldError[] }
  | {
      ok: true;
      row: ProjectRow;
      // 행동 로그 — 4칸은 전후 값, 추가 칸은 바뀐 키 목록만(값 없음 — 노출표가 끈 계급의 값이 기록 보는 사람에게 새지 않게).
      changed: Partial<Record<"name" | "clientId" | "teamId" | "pmUserId", { from: string; to: string }>> & { customFields?: string[] };
      // 응답에 싣는 추가 칸 — 같은 tx의 입력 칸 키 집합으로 거른 저장값(숨은 · 보관 칸 값 없음, eng P1-2 · r2 N3).
      customFields: Record<string, unknown>;
    };

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function applyInfoChange(viewer: Viewer, locked: ProjectRow, input: InfoInput, facts: InfoFacts, tx: DbOrTx): Promise<InfoChangeResult> {
  const rights = infoEditRights({
    canEditInfo: facts.canEditInfo,
    isAssignedPm: locked.pmUserId === viewer.id,
    actorCoversTeam: coversProjectTeam(facts.teamScope, locked.teamId),
  });
  if (rights === "none") denyWrite(viewer, INFO_RULE, { projectId: locked.id }, new ForbiddenError("프로젝트 정보 수정 권한 없음"));
  // D-7220 — 화면이 읽은 version과 잠근 행이 다르면 덮어쓰지 않는다(상태 · 자동 정산도 version을 올리지만 그때는 seenStatus 판정이 먼저 막는다).
  if (locked.version !== input.baselineVersion) throw new InfoConflictError(infoConflictMessage(locked.updatedAt));

  const before: InfoValues = { name: locked.name, clientId: locked.clientId, teamId: locked.teamId, pmUserId: locked.pmUserId };
  const after: InfoValues = {
    name: input.name !== undefined ? input.name.trim() : before.name,
    clientId: input.clientId?.toLowerCase() ?? before.clientId,
    teamId: input.teamId?.toLowerCase() ?? before.teamId,
    // 사람 id는 uuid가 아닌 글자 id(인증 표)라 대소문자를 그대로 둔다 — 고객사 · 팀은 uuid라 소문자로 맞춘다(createProject와 같은 꼴).
    pmUserId: input.pmUserId ?? before.pmUserId,
  };
  const keys = ["name", "clientId", "teamId", "pmUserId"] as const;
  const changedKeys = keys.filter((key) => after[key] !== before[key]);

  // 07.5-02(D-7506 · D-7507 · T-04.5-44) — 추가 칸: 잠근 행 저장값에서 update 모드로. 입력 칸 집합은 잠근 뒤 같은 tx로 읽는다.
  // 입력 밖 키(숨은 · 보관 · project.value 꺼짐)의 제출값은 버리고 저장값은 남는다. 정의에 없는 키는 그대로 던진다.
  const stored = (locked.customFields ?? {}) as Record<string, unknown>;
  const { inputDefs, knownKeys } = await readCustomFieldInputs(viewer, { entity: "project", valueInfoItem: "project.value" }, tx);
  const inputKeys = new Set(inputDefs.map((def) => def.key));
  let customFields = stored;
  const customErrors: InfoChangeFieldError[] = [];
  if (input.customFields !== undefined) {
    try {
      customFields = resolveCustomFieldsWrite({ mode: "update", inputDefs, knownKeys, stored, submitted: input.customFields });
    } catch (error) {
      if (!(error instanceof CustomFieldsInvalidError)) throw error;
      for (const [key, reason] of Object.entries(error.fieldErrors)) customErrors.push({ field: `customFields.${key}`, reason });
    }
  }
  const changedCustomKeys = [...new Set([...Object.keys(stored), ...Object.keys(customFields)])].filter((key) => !sameJson(stored[key], customFields[key]));
  const visibleCustomFields = (row: ProjectRow) => pickVisibleCustomFields((row.customFields ?? {}) as Record<string, unknown>, inputKeys) ?? {};

  if (changedKeys.length === 0 && changedCustomKeys.length === 0 && customErrors.length === 0) {
    return { ok: true, row: locked, changed: {}, customFields: visibleCustomFields(locked) };
  }

  const extra: InfoFieldError[] = [];
  const clientChanged = after.clientId !== before.clientId;
  const teamChanged = after.teamId !== before.teamId;
  // 잠근 뒤 센다 — 잠금 전에 붙은 돈 문서도 본다(archiveProject와 같은 자리).
  const moneyCount = clientChanged || teamChanged ? (await countMoneyAttachments(viewer, locked.id, tx)).total : 0;
  if (clientChanged) {
    const kind = (await findVendorKindsByIds(viewer, [after.clientId], tx)).get(after.clientId);
    if (facts.clientArchived !== false || !kind || !servesSide(kind, "client")) extra.push({ field: "client", reason: NOT_CLIENT_VENDOR });
  }
  if (teamChanged) {
    const team = await findTeamById(viewer, after.teamId, tx);
    if (!team || team.archivedAt !== null || !coversProjectTeam(facts.teamScope, after.teamId)) extra.push({ field: "team", reason: TEAM_OUT_OF_SCOPE });
  }
  let pmEligibleAfter = true;
  if (teamChanged || after.pmUserId !== before.pmUserId) {
    const [person, membership, participants] = await Promise.all([
      findUserById(viewer, after.pmUserId, tx),
      findMembershipAtDate(viewer, after.pmUserId, facts.todayKst, tx),
      findLiveMemberUserIds(viewer, locked.id, tx),
    ]);
    pmEligibleAfter =
      person !== null && person.archivedAt === null && pmEligible({ teamIdAfter: after.teamId, memberTeamId: membership?.teamId ?? null, participant: participants.has(after.pmUserId) });
  }
  const seen = new Set<InfoField>();
  const errors: InfoChangeFieldError[] = [
    ...[...validateInfoChange({ before, after, moneyCount, pmEligibleAfter }), ...extra].filter((error) => {
      if (seen.has(error.field)) return false;
      seen.add(error.field);
      return true;
    }),
    ...customErrors,
  ];
  if (errors.length > 0) return { ok: false, errors };

  // DB 패치는 거르지 않은 결과(숨은 · 보관 값 보존) — 같은 version 비교 · +1(D-7520). 응답은 입력 칸 키로 거른 값만.
  const patch = {
    ...Object.fromEntries(changedKeys.map((key) => [key, after[key]])),
    ...(changedCustomKeys.length > 0 ? { customFields } : {}),
  };
  const row = await updateProjectInfoIfVersion(viewer, locked.id, { patch, expectedVersion: input.baselineVersion }, tx);
  if (!row) throw new InfoConflictError(infoConflictMessage(locked.updatedAt));
  return {
    ok: true,
    row,
    changed: {
      ...Object.fromEntries(changedKeys.map((key) => [key, { from: before[key], to: after[key] }])),
      ...(changedCustomKeys.length > 0 ? { customFields: changedCustomKeys } : {}),
    },
    customFields: visibleCustomFields(row),
  };
}

// 화면 재료 — 고칠 권리가 있을 때만 부른다(소속 팀은 권리자에게만 · T-07.2-17-07). 이름은 등록 폼 축소 투영 그대로.
export type InfoPmCandidate = ProjectReferenceOption & { memberTeamId: string | null; participant: boolean };
export type InfoEditCandidates = { clients: ProjectReferenceOption[]; teams: ProjectReferenceOption[]; pmUsers: InfoPmCandidate[] };

export async function listInfoEditCandidates(
  viewer: Viewer,
  projectId: string,
  opts: { todayKst: string; teamScope: ActorTeamScope; rights: InfoRights },
): Promise<InfoEditCandidates | null> {
  if (opts.rights === "none") return null;
  const references = await listProjectFormReferences(viewer);
  const [memberships, participants] = await Promise.all([
    findMembershipsAtDate(
      viewer,
      references.pmUsers.map((user) => user.id),
      opts.todayKst,
    ),
    findLiveMemberUserIds(viewer, projectId),
  ]);
  const teamOf = new Map(memberships.map((row) => [row.userId, row.teamId]));
  return {
    clients: references.clients,
    // 플래너 가정(팀 범위) — 업무 범위가 덮는 팀만(회사 범위면 전부). 서버도 같은 판정으로 다시 잰다.
    teams: references.teams.filter((team) => coversProjectTeam(opts.teamScope, team.id)),
    pmUsers: references.pmUsers.map((user) => ({ ...user, memberTeamId: teamOf.get(user.id) ?? null, participant: participants.has(user.id) })),
  };
}

// 상세 화면 재료 — 권리는 합성 저장과 같은 판정(쓰기 행 범위로 좁힌 업무 범위)으로 잰다. 보관된 프로젝트는 고치지 않는다.
export async function loadInfoEditView(
  viewer: Viewer,
  project: { id: string; teamId: string; pmUserId: string; archivedAt: Date | null },
  opts: { todayKst: string },
): Promise<{ rights: InfoRights; candidates: InfoEditCandidates | null }> {
  if (project.archivedAt !== null) return { rights: "none", candidates: null };
  const [canEditInfo, actorScope, rowScope] = await Promise.all([
    can(viewer, INFO_RULE, "write"),
    loadActorTeamScope(viewer, opts),
    projectRowScope(viewer, undefined, "write"),
  ]);
  const teamScope = await teamScopeForProject(viewer, actorScope, rowScope, project.id);
  const rights = infoEditRights({ canEditInfo, isAssignedPm: project.pmUserId === viewer.id, actorCoversTeam: coversProjectTeam(teamScope, project.teamId) });
  return { rights, candidates: await listInfoEditCandidates(viewer, project.id, { todayKst: opts.todayKst, teamScope, rights }) };
}
