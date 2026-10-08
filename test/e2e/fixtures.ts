import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { and, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { archive } from "@/domain/archive";
import { createFieldDefinition, updateFieldDefinition } from "@/domain/custom-fields/admin";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { findFieldDefinitionById } from "@/repositories/field-definitions";
import { findRoleById, insertRole } from "@/repositories/roles";
import { insertVisibilityIfAbsent, listVisibility } from "@/repositories/permissions";

// 실행마다 고유한 사업자번호(「xxx-xx-xxxxx」) — 같은 사업자번호 거래처는 둘 못 만들고 E2E DB는 스펙끼리 공유한다.
let businessNoSeq = 0;
export function uniqueBusinessNo(): string {
  businessNoSeq += 1;
  // 앞 아홉 자리는 고유하게, 마지막은 검증 숫자(국세청 규칙)로 채운다 — 등록 폼이 검증 숫자를 본다.
  const base = String(Date.now() * 10 + (businessNoSeq % 10)).slice(-9).padStart(9, "1");
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((acc, weight, i) => acc + Number(base[i]) * weight, 0) + Math.floor((Number(base[8]) * 5) / 10);
  const digits = base + String((10 - (sum % 10)) % 10);
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// D-36(03-02): 계급 식별자가 필수 필드다 — 선택 인자가 아니다(호출자가 계급을
// 의식하지 않고 픽스처를 만드는 상태를 없앤다). 표시 이름은 시스템 관리자
// 계급만 「E2E Admin」이고 나머지는 전부 「E2E Employee」다 — E2E 스펙이
// 이미 이 두 문자열로 사용자 메뉴 트리거 등을 찾는다(기존 계약 유지).
// withTeam — 새 팀에 과거 날짜로 발령한다. 팀 업무 범위 계급은 내 팀으로만 프로젝트를 등록할 수 있다.
// teamId — 06.2(D-6203): 팀 범위 뷰어가 같은 팀 프로젝트를 보게 — 새 본부 · 팀을 만들지 않고 기존 팀에 같은 날짜로 발령한다.
// 반환 teamId는 만들었거나 받은 팀(팀 없으면 null) — 다른 사용자를 같은 팀에 둘 때 쓴다.
export async function createFixtureUser(options: {
  roleId: string;
  withTeam?: boolean;
  teamId?: string;
}): Promise<{ email: string; password: string; teamId: string | null }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const name = options.roleId === SYSADMIN_ROLE_ID ? "E2E Admin" : "E2E Employee";
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name,
    roleId: options.roleId,
  });
  let teamId: string | null = null;
  if (options.teamId) {
    teamId = options.teamId;
  } else if (options.withTeam) {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    // 팀 이름은 /projects 팀 필터 select 폭을 정한다 — 전체 UUID면 375px를 넘친다(projects-list-number-nowrap).
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    teamId = team.id;
  }
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2020-01-01" });
  return { email, password: tempPassword, teamId };
}

// 04.5: 이 페이즈의 E2E는 만든 화면 항목(칸 정의)을 끝에 항상 보관한다 — 뒤 스펙(거래처 · 노출표)에 칸이 남지 않게.
// 스펙마다 자기 접두를 쓴다(예: field-definitions.spec.ts는 「E2E칸」).
export async function archiveE2EFieldDefinitions(labelPrefix: string): Promise<void> {
  await db
    .update(fieldDefinitions)
    .set({ archivedAt: new Date(), version: sql`${fieldDefinitions.version} + 1` })
    .where(and(like(fieldDefinitions.label, `${labelPrefix}%`), isNull(fieldDefinitions.archivedAt)));
}

// 04.5-06: 거래처 폼 E2E 격리 — 이 스펙이 만든 필수 칸이 다른 워커의 시스템 관리자 거래처 등록을 막지 않게
// 칸을 처음부터 전용 계급에만 보이게 만든다(전 계급에 보였다가 끄는 창을 두지 않는다).
// 전용 계급은 domain createRole이 아니라 리포지토리 insertRole로 넣는다 — createRole의 grant가 돌면 같은 시각
// 다른 스펙의 필수 칸 보임 행이 이 계급에 생겨 이 사용자의 거래처 저장이 막힐 수 있다.
export async function createE2EVendorEditor(
  options: { vendorValue?: boolean } = {},
): Promise<{ email: string; password: string; roleId: string; roleName: string }> {
  const roleId = `role-e2e-vcf-${randomUUID()}`;
  const roleName = `E2E 거래처 ${roleId.slice(-8)}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: roleName, sortOrder: 99 });
  await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action: "view", allowed: true });
  await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action: "write", allowed: true });
  await insertVisibilityIfAbsent(SYSTEM_VIEWER, {
    roleId,
    infoItem: "vendor.value",
    visible: options.vendorValue ?? true,
  });
  const credentials = await createFixtureUser({ roleId });
  return { ...credentials, roleId, roleName };
}

// 칸 하나를 만든다 — 노출 행은 onlyRoleId 계급에만 생성 트랜잭션 안에서 생긴다(계급 목록 deps 주입).
// 주입 함수는 DB를 부르지 않는다(잠금을 쥔 트랜잭션 안에서 전역 db로 또 조회하면 풀 고갈 경로가 된다).
export async function createE2EFieldDefinition(input: {
  label: string;
  type: "text" | "number" | "date" | "select";
  required: boolean;
  options?: string[];
  sortOrder?: number;
  onlyRoleId: string;
}): Promise<{ id: string; key: string; version: number }> {
  const role = await findRoleById(SYSTEM_VIEWER, input.onlyRoleId);
  if (!role) throw new Error(`E2E 전용 계급이 없습니다: ${input.onlyRoleId}`);
  const created = await createFieldDefinition(
    SYSTEM_VIEWER,
    {
      name: input.label,
      type: input.type,
      required: input.required,
      sortOrder: input.sortOrder ?? 0,
      options: input.type === "select" ? input.options : undefined,
    },
    { listRoles: () => Promise.resolve([role]) },
  );
  const info = customFieldInfoItem("vendor", created.key);
  const rows = (await listVisibility(SYSTEM_VIEWER)).filter((row) => row.infoItem === info);
  const own = rows.find((row) => row.roleId === input.onlyRoleId);
  if (!own || !own.visible) throw new Error(`전용 계급 노출 행이 없습니다: ${info}`);
  for (const seeded of [SYSADMIN_ROLE_ID, DEFAULT_ROLE_ID]) {
    if (rows.some((row) => row.roleId === seeded)) throw new Error(`시드 계급에 노출 행이 생겼습니다: ${seeded} · ${info}`);
  }
  const row = await findFieldDefinitionById(SYSTEM_VIEWER, created.id);
  if (!row) throw new Error(`만든 칸을 다시 읽지 못했습니다: ${created.id}`);
  return { id: created.id, key: created.key, version: row.version };
}

// 선택지 하나를 뺀다 — 서버가 그 선택지를 보관으로 파생한다(남는 활성 선택지는 1개 이상이어야 한다).
export async function archiveE2EFieldDefinitionOption(id: string, option: string): Promise<void> {
  const row = await findFieldDefinitionById(SYSTEM_VIEWER, id);
  if (!row) throw new Error(`칸이 없습니다: ${id}`);
  const active = Array.isArray(row.options) ? (row.options as string[]) : [];
  await updateFieldDefinition(SYSTEM_VIEWER, {
    id,
    version: row.version,
    name: row.label,
    required: row.required,
    sortOrder: row.sortOrder,
    options: active.filter((item) => item !== option),
  });
}

// 거래처 보관(기존 domain archive).
export async function archiveE2EVendor(vendorId: string): Promise<void> {
  await archive(SYSTEM_VIEWER, "vendor", vendorId);
}

// 프로젝트 상세 「법인카드 사용」 섹션(06-07 S15)은 화면이 뜬 뒤 서버 액션으로 따로 불러온다. 서버 액션 요청을 세거나 · 붙잡거나 ·
// 끊는 스펙과 표 끝 줄(tfoot)을 읽는 스펙은 이 요청이 끝난 뒤(뼈대 aria-busy가 걷힌 뒤)에 시작한다 — 아니면 섹션 요청이 섞인다.
export async function waitForCardUsageSection(page: Page): Promise<void> {
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "법인카드 사용", exact: true }) });
  await expect(section).toBeVisible();
  await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
}
