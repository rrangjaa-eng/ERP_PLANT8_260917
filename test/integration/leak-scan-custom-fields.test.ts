import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines, roles } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { can } from "@/domain/permissions/can";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { archive } from "@/domain/archive";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createFieldDefinition } from "@/domain/custom-fields/admin";
import { customFieldInfoItem, type FieldDefinitionTarget } from "@/domain/custom-fields/targets";
import { createVendor, listVendors, searchVendors, updateVendor } from "@/domain/vendors";
import { exportVendorsCsv } from "@/domain/vendors/export";
import { createProject, findProject, loadProjectList } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { findVisibility, upsertVisibility } from "@/repositories/permissions";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";

// 07.5-05 SC3 · T-07.5-05-02 — 세 대상 × 출구 × 시드 계급 누수 스캔(새 파일 — leak-scan.test.ts는 고치지 않는다, RESEARCH §2).
// 칸 A · B 값을 심고, 켠 상태 직렬화에 두 값이 있음을 먼저 확인(헛통과 방지)한 뒤 그 계급의 `cf.<entity>.<A>`만 끄면
// A 값은 직렬화 · CSV · 검색 결과에서 사라지고 B 값은 남는다(다음 사례는 B를 끈다).
// 출구 목록(새 출구가 생기면 여기에 한 줄 · 아래 표에 한 줄):
//   거래처   — 목록(상세 = 목록 행 · 자동완성) · 목록 검색(추가 칸 텍스트) · 파일 받기 CSV · 등록 응답 · 수정 응답
//   프로젝트 — findProject(상세) · 등록 응답 · 목록(값을 싣지 않는다 — 07.5-04 사용자 결정, 켠 상태도 없음) · 목록 검색 · 정보 저장 응답
//   견적 줄  — listQuoteLines(목록 = 견적 표) · 줄 저장 응답
// 시드 계급은 DB에서 읽는다(이름 · 개수를 하드코딩하지 않는다). 메뉴 권한이 없어 출구에 닿지 못하는 계급은 「출구 없음」 이유와 함께
// 건너뛴 목록에 남기고 단언한다(조용한 건너뜀 금지). 바깥 문(vendor.value · project.value)이 꺼진 계급은 켜기 전후 둘 다 값이 없다.
// 끈 노출 행은 사례마다 finally에서 되돌리고 심은 칸은 끝에 보관한다(eng C-12).

type Kind = "value" | "never" | "search";
type Gate = { menu: string; action: "view" | "write" };
type Ctx = { viewer: Viewer; projectId: string; revisionId: string; vendorId: string; vendorName: string; status: string; teamId: string };
type Field = { id: string; key: string; label: string; value: string };
// 값 출구 — 직렬화 글자를 돌려준다. on = 켠 상태(A · B 모두 실을 수 있음), offKey = 끈 칸(쓰기 출구는 그 칸을 보내지 않는다).
type Exit = {
  name: string;
  kind: Kind;
  gates: Gate[];
  run: (ctx: Ctx, fields: Field[], offKey: string | null) => Promise<string>;
  // 검색 출구 — 그 값으로 찾았을 때 대상 행이 걸리는가.
  hit?: (ctx: Ctx, value: string) => Promise<boolean>;
};

const tag = () => randomUUID().slice(0, 8);

function writable(fields: Field[], offKey: string | null): Record<string, string> {
  return Object.fromEntries(fields.filter((field) => field.key !== offKey).map((field) => [field.key, field.value]));
}

const VENDOR_EXITS: Exit[] = [
  {
    name: "거래처 목록 · 상세 · 자동완성",
    kind: "value",
    gates: [{ menu: "admin.vendors", action: "view" }],
    run: async (ctx) =>
      JSON.stringify([
        ...(await listVendors(ctx.viewer)).filter((row) => row.id === ctx.vendorId),
        ...(await searchVendors(ctx.viewer, ctx.vendorName)).filter((row) => row.id === ctx.vendorId),
      ]),
  },
  {
    name: "거래처 목록 검색",
    kind: "search",
    gates: [{ menu: "admin.vendors", action: "view" }],
    run: () => Promise.resolve(""),
    hit: async (ctx, value) => (await listVendors(ctx.viewer, { q: value })).some((row) => row.id === ctx.vendorId),
  },
  {
    name: "거래처 파일 받기 CSV",
    kind: "value",
    gates: [{ menu: "admin.vendors", action: "view" }],
    run: async (ctx) => (await exportVendorsCsv(ctx.viewer, { q: ctx.vendorName, includeHidden: false, kind: null })).body,
  },
  {
    name: "거래처 등록 응답",
    kind: "value",
    gates: [{ menu: "admin.vendors", action: "write" }],
    run: async (ctx, fields, offKey) =>
      JSON.stringify(await createVendor(ctx.viewer, { name: `누수등록-${tag()}`, customFields: writable(fields, offKey) })),
  },
  {
    name: "거래처 수정 응답",
    kind: "value",
    gates: [{ menu: "admin.vendors", action: "write" }],
    run: async (ctx) => JSON.stringify(await updateVendor(ctx.viewer, ctx.vendorId, { name: ctx.vendorName })),
  },
];

const PROJECT_EXITS: Exit[] = [
  {
    name: "프로젝트 상세 findProject",
    kind: "value",
    gates: [{ menu: "projects", action: "view" }],
    run: async (ctx) => JSON.stringify(await findProject(ctx.viewer, ctx.projectId)),
  },
  {
    name: "프로젝트 등록 응답",
    kind: "value",
    gates: [{ menu: "projects", action: "write" }],
    run: async (ctx, fields, offKey) => {
      const [project] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, ctx.projectId));
      return JSON.stringify(
        await createProject(ctx.viewer, {
          clientId: project!.clientId,
          teamId: ctx.teamId,
          pmUserId: ctx.viewer.id,
          name: `누수등록-${tag()}`,
          customFields: writable(fields, offKey),
        }),
      );
    },
  },
  {
    name: "프로젝트 목록",
    kind: "never",
    gates: [{ menu: "projects", action: "view" }],
    run: async (ctx) => JSON.stringify(await loadProjectList(ctx.viewer, { year: "all" })),
  },
  {
    name: "프로젝트 목록 검색",
    kind: "search",
    gates: [{ menu: "projects", action: "view" }],
    run: () => Promise.resolve(""),
    hit: async (ctx, value) => (await loadProjectList(ctx.viewer, { year: "all", search: value })).rows.some((row) => row.id === ctx.projectId),
  },
  {
    name: "프로젝트 정보 저장 응답",
    kind: "value",
    gates: [{ menu: "projects.info", action: "write" }],
    run: async (ctx) => {
      const [current] = await db.select({ status: projects.status, version: projects.version }).from(projects).where(eq(projects.id, ctx.projectId));
      return JSON.stringify(
        await saveProjectLedger(ctx.viewer, ctx.projectId, {
          seenStatus: current!.status as "bidding",
          info: { baselineVersion: current!.version, customFields: {} },
        }),
      );
    },
  },
];

const QUOTE_LINE_EXITS: Exit[] = [
  {
    name: "견적 표 listQuoteLines",
    kind: "value",
    gates: [{ menu: "projects", action: "view" }],
    run: async (ctx) => JSON.stringify(await listQuoteLines(ctx.viewer, ctx.revisionId, { status: ctx.status, canWrite: true })),
  },
  {
    name: "견적 줄 저장 응답",
    kind: "value",
    gates: [{ menu: "projects", action: "write" }],
    run: async (ctx) => {
      const [line] = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, ctx.revisionId)).orderBy(asc(quoteLines.sortOrder));
      return JSON.stringify(
        await saveQuoteLines(ctx.viewer, ctx.revisionId, {
          rows: [
            {
              id: line!.id,
              version: line!.version,
              subcategory: line!.subcategory,
              itemName: line!.itemName,
              quantity: Number(line!.quantity),
              unitPrice: { currency: "KRW", amount: line!.unitPriceAmountKrw, fxRate: 1 },
              execution: { currency: "KRW", amount: line!.executionAmountKrw, fxRate: 1 },
              lineStatus: line!.lineStatus,
            },
          ],
        }),
      );
    },
  },
];

const TARGET_SETUP: Array<{ entity: FieldDefinitionTarget; outerGate: string; exits: Exit[] }> = [
  { entity: "vendor", outerGate: "vendor.value", exits: VENDOR_EXITS },
  { entity: "project", outerGate: "project.value", exits: PROJECT_EXITS },
  { entity: "quote_line", outerGate: "project.value", exits: QUOTE_LINE_EXITS },
];

async function seedRoles(): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.sortOrder), asc(roles.id));
}

// 계급마다 팀에 든 사람 · 그 팀 프로젝트(그 사람이 담당 PM) · 견적 줄 하나 — 팀 · 본부 범위 계급도 행을 본다.
async function setupRole(roleId: string, clientId: string, values: Record<FieldDefinitionTarget, Record<string, string>>) {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `lscf-${randomUUID()}@example.test`, name: "누수 스캔 추가 칸", roleId });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `누수본부-${tag()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `누수팀-${tag()}` });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: "2020-01-01" });
  const project = await createProject(SYSTEM_VIEWER, { clientId, teamId: team.id, pmUserId: userId, name: `누수스캔-${tag()}` });
  await db.update(projects).set({ customFields: values.project }).where(eq(projects.id, project.id));
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  await db.insert(quoteLines).values({
    revisionId: revision.id,
    sortOrder: 0,
    subcategory: (await firstSelectableSubcategory()).value,
    itemName: `누수줄-${tag()}`,
    unitPriceAmountKrw: 100_000,
    executionAmountKrw: 50_000,
    quoteAmountKrw: 100_000,
    profitKrw: 50_000,
    customFields: values.quote_line,
  });
  return { viewer: { id: userId, roleId } satisfies Viewer, projectId: project.id, revisionId: revision.id, status: project.status, teamId: team.id };
}

async function gateReason(viewer: Viewer, gates: Gate[]): Promise<string | null> {
  for (const gate of gates) {
    if (!(await can(viewer, gate.menu, gate.action))) return `출구 없음 · ${gate.menu} ${gate.action} 권한 없음`;
  }
  return null;
}

async function outerGateOn(roleId: string, item: string): Promise<boolean> {
  return (await findVisibility(SYSTEM_VIEWER, roleId, item))?.visible === true;
}

describe("누수 스캔 — 세 대상 추가 칸 × 출구 × 시드 계급 (07.5-05 SC3)", () => {
  it("켠 상태에 값이 있고, 그 계급의 칸 하나를 끄면 그 값만 모든 출구에서 사라진다 · 건너뛴 계급은 이유가 있다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `lscf-admin-${randomUUID()}@example.test`, name: "누수 스캔 관리자", roleId: SYSADMIN_ROLE_ID });
    const admin: Viewer = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const seeds = await seedRoles();
    expect(seeds.length).toBeGreaterThan(0);

    // 칸은 계급을 다 읽은 뒤 관리 경로로 만든다(전 계급 보임 — D-7508). 이름은 서로의 부분 글자가 아니다.
    const fields = {} as Record<FieldDefinitionTarget, Field[]>;
    for (const { entity } of TARGET_SETUP) {
      fields[entity] = [];
      for (const letter of ["가", "나"]) {
        const t = tag();
        const created = await createFieldDefinition(admin, { name: `누수${letter}${t}`, type: "text", required: false, sortOrder: 1, target: entity });
        fields[entity].push({ id: created.id, key: created.key, label: `누수${letter}${t}`, value: `누수값${letter}-${entity}-${t}` });
      }
    }
    const values = Object.fromEntries(
      TARGET_SETUP.map(({ entity }) => [entity, Object.fromEntries(fields[entity].map((field) => [field.key, field.value]))]),
    ) as Record<FieldDefinitionTarget, Record<string, string>>;
    const vendorName = `누수스캔거래처${tag()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName, customFields: values.vendor });

    const checked: string[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    try {
      for (const role of seeds) {
        const fx = await setupRole(role.id, vendor.id, values);
        const ctx: Ctx = { ...fx, vendorId: vendor.id, vendorName };
        for (const { entity, outerGate, exits } of TARGET_SETUP) {
          const own = fields[entity];
          const outerOn = await outerGateOn(role.id, outerGate);
          for (const exit of exits) {
            const name = `${entity} · ${exit.name} · ${role.id}`;
            const reason = await gateReason(fx.viewer, exit.gates);
            if (reason) {
              skipped.push({ name, reason });
              continue;
            }
            await assertExit(name, exit, ctx, own, entity, role.id, outerOn);
            checked.push(name);
          }
        }
      }
    } finally {
      // 사례마다 finally가 이미 되돌렸다 — 도중 실패에도 끈 행이 남지 않게 한 번 더 켜고, 심은 칸은 보관한다.
      for (const { entity } of TARGET_SETUP) {
        for (const field of fields[entity]) {
          for (const role of seeds) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: customFieldInfoItem(entity, field.key), visible: true });
          await archive(admin, "field_definitions", field.id);
        }
      }
    }

    console.log(`추가 칸 누수 스캔 단언 ${checked.length}건 · 건너뜀 ${skipped.length}건: ${skipped.map((entry) => `${entry.name}(${entry.reason})`).join(", ")}`);
    // 건너뜀은 모두 이유가 있고, 전 사례 = 단언 + 건너뜀이며, 출구마다 적어도 한 계급은 실제로 단언했다(헛통과 방지).
    expect(skipped.every((entry) => entry.reason.startsWith("출구 없음 · "))).toBe(true);
    const total = seeds.length * TARGET_SETUP.reduce((sum, target) => sum + target.exits.length, 0);
    expect(checked.length + skipped.length).toBe(total);
    for (const { entity, exits } of TARGET_SETUP) {
      for (const exit of exits) {
        expect(checked.some((name) => name.startsWith(`${entity} · ${exit.name} · `)), `${entity} · ${exit.name}: 단언한 계급이 없다`).toBe(true);
      }
    }
  });

  it("바깥 문(vendor.value · project.value)을 끈 계급은 켜기 전후 모두 세 대상 값이 없다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `lscf-gate-${randomUUID()}@example.test`, name: "누수 스캔 바깥 문", roleId: SYSADMIN_ROLE_ID });
    const admin: Viewer = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const made = {} as Record<FieldDefinitionTarget, Field>;
    for (const { entity } of TARGET_SETUP) {
      const t = tag();
      const created = await createFieldDefinition(admin, { name: `문${t}`, type: "text", required: false, sortOrder: 1, target: entity });
      made[entity] = { id: created.id, key: created.key, label: `문${t}`, value: `바깥문값-${entity}-${t}` };
    }
    const values = Object.fromEntries(TARGET_SETUP.map(({ entity }) => [entity, { [made[entity].key]: made[entity].value }])) as Record<
      FieldDefinitionTarget,
      Record<string, string>
    >;
    const vendorName = `바깥문거래처${tag()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName, customFields: values.vendor });
    const fx = await setupRole(SYSADMIN_ROLE_ID, vendor.id, values);
    const ctx: Ctx = { ...fx, viewer: admin, vendorId: vendor.id, vendorName };
    // 관리자 viewer로 프로젝트를 보게 담당 PM을 관리자로 둔다.
    await db.update(projects).set({ pmUserId: admin.id }).where(eq(projects.id, fx.projectId));

    for (const gate of ["vendor.value", "project.value"]) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: gate, visible: false });
    }
    try {
      for (const { entity, exits } of TARGET_SETUP) {
        for (const exit of exits.filter((each) => each.kind !== "search" && each.gates.every((gate) => gate.action === "view"))) {
          const serialized = await exit.run(ctx, [made[entity]], null);
          expect(serialized, `${entity} · ${exit.name}: 바깥 문이 꺼졌는데 값이 있다`).not.toContain(made[entity].value);
        }
        for (const exit of exits.filter((each) => each.kind === "search")) {
          expect(await exit.hit!(ctx, made[entity].value), `${entity} · ${exit.name}: 바깥 문이 꺼졌는데 검색에 걸린다`).toBe(false);
        }
      }
    } finally {
      for (const gate of ["vendor.value", "project.value"]) {
        await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: gate, visible: true });
      }
    }

    // 문을 다시 켜면 값이 돌아온다(위 단언이 헛통과가 아니었음을 확인).
    expect(await VENDOR_EXITS[0]!.run(ctx, [made.vendor], null)).toContain(made.vendor.value);
    expect(await PROJECT_EXITS[0]!.run(ctx, [made.project], null)).toContain(made.project.value);
    expect(await QUOTE_LINE_EXITS[0]!.run(ctx, [made.quote_line], null)).toContain(made.quote_line.value);
    for (const { entity } of TARGET_SETUP) await archive(admin, "field_definitions", made[entity].id);
  });
});

// 한 출구 · 한 계급: 칸마다 차례로 끄고(나머지 칸은 켠 채) 끈 칸 값만 사라지는지 본다. 끈 행은 finally에서 되돌린다.
async function assertExit(name: string, exit: Exit, ctx: Ctx, own: Field[], entity: FieldDefinitionTarget, roleId: string, outerOn: boolean) {
  if (exit.kind === "never") {
    const serialized = await exit.run(ctx, own, null);
    for (const field of own) expect(serialized, `${name}: 목록에 추가 칸 값이 실렸다`).not.toContain(field.value);
    return;
  }
  // 켠 상태 — 바깥 문이 켜졌으면 두 값이 모두 있다(헛통과 방지), 꺼졌으면 둘 다 없다.
  if (exit.kind === "search") {
    for (const field of own) expect(await exit.hit!(ctx, field.value), `${name}: 켠 상태 ${field.label} 검색`).toBe(outerOn);
  } else {
    const before = await exit.run(ctx, own, null);
    for (const field of own) {
      if (outerOn) expect(before, `${name}: 끄기 전 ${field.label} 값이 없다(헛통과)`).toContain(field.value);
      else expect(before, `${name}: 바깥 문 꺼짐인데 ${field.label} 값이 있다`).not.toContain(field.value);
    }
  }

  for (const off of own) {
    const item = customFieldInfoItem(entity, off.key);
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: item, visible: false });
    try {
      const others = own.filter((field) => field.key !== off.key);
      if (exit.kind === "search") {
        expect(await exit.hit!(ctx, off.value), `${name}: 끈 칸 ${off.label} 값으로 검색이 걸린다`).toBe(false);
        for (const other of others) expect(await exit.hit!(ctx, other.value), `${name}: 다른 칸 ${other.label} 검색`).toBe(outerOn);
      } else {
        const after = await exit.run(ctx, own, off.key);
        expect(after, `${name}: 끈 칸 ${off.label} 값이 남았다`).not.toContain(off.value);
        expect(after, `${name}: 끈 칸 ${off.label} 이름이 남았다`).not.toContain(off.label);
        for (const other of others) {
          if (outerOn) expect(after, `${name}: 다른 칸 ${other.label} 값이 사라졌다`).toContain(other.value);
        }
      }
    } finally {
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: item, visible: true });
    }
  }
}
