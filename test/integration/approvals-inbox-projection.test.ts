import { describe, expect, it, vi } from "vitest";

// 04.1-05(CEO-17 · Codex MEDIUM): 결재함 상세 한 번의 읽기 수를 세는 주입 — 기본 동작은 실제 함수 그대로다.
vi.mock("@/repositories/leave-requests", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/leave-requests")>("@/repositories/leave-requests");
  return { ...actual, findLeaveRequestsByIds: vi.fn(actual.findLeaveRequestsByIds) };
});
vi.mock("@/repositories/leave-usage", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/leave-usage")>("@/repositories/leave-usage");
  return { ...actual, listLeaveUsage: vi.fn(actual.listLeaveUsage) };
});
vi.mock("@/repositories/leave-adjustments", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/leave-adjustments")>("@/repositories/leave-adjustments");
  return { ...actual, listLeaveAdjustments: vi.fn(actual.listLeaveAdjustments) };
});
vi.mock("@/domain/settings/registry", async () => {
  const actual = await vi.importActual<typeof import("@/domain/settings/registry")>("@/domain/settings/registry");
  return { ...actual, getSettingValue: vi.fn(actual.getSettingValue) };
});

import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { approveDocument, getApprovalView, listMyInbox, previewRoute } from "@/domain/approvals";
import { listMyLeave, submitLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { getLeaveBalanceForRequest } from "@/domain/leave/balance-service";
import { formatBalanceRow } from "@/domain/leave/balance";
import type { LeaveRequestBalanceDto } from "@/domain/leave/dto";
import { setHireDate, setResignationDate } from "@/domain/people";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { APPROVAL_ROUTE_LEAVE_SELF_APPROVAL } from "@/domain/settings/keys";
import { findVisibility, upsertVisibility } from "@/repositories/permissions";
import { findLeaveRequestsByIds } from "@/repositories/leave-requests";
import { listLeaveUsage } from "@/repositories/leave-usage";
import { listLeaveAdjustments } from "@/repositories/leave-adjustments";
import { makePerson, countRows, NOW_2026 } from "./approvals-fixtures";

// CEO-17: 결재함 · 내 연차 목록은 요청 하나 안에서만 사는 노출 메모로 정보 항목마다
// 한 번만 노출표를 읽는다. CX-R3: 결재선 미리보기는 approval.value 투영을 지난다.

function countingFindVisibility() {
  const counter = { calls: 0 };
  const fn: typeof findVisibility = (...args) => {
    counter.calls++;
    return findVisibility(...args);
  };
  return { counter, fn };
}

const DAY = (d: number) => {
  const date = `2026-10-${String(d).padStart(2, "0")}`;
  return { kind: "full_day", startDate: date, endDate: date, half: "" };
};
// 2026-10의 평일 22일.
const WEEKDAYS = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30];

describe("결재함 · 내 연차 목록 노출 조회 수(CEO-17)", () => {
  it("대표 결재함 한 번(진행 중 20건 · 처리 3건)의 노출 조회는 2회 이하, 두 번째 요청도 다시 조회, 결과는 주입 없는 것과 같다", async () => {
    // 기획1팀에 팀장 없음 · 본부 책임자 · 경영관리 없음 → 지금 단계는 4단(대표).
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const submitted = [];
    for (let i = 0; i < 23; i++) {
      submitted.push(await submitLeave(drafter, DAY(WEEKDAYS[i % WEEKDAYS.length] ?? 1), { now: NOW_2026 }));
    }
    for (const doc of submitted.slice(0, 3)) {
      await approveDocument(ceo, { instanceId: doc.instanceId, expectedVersion: doc.version }, { now: NOW_2026 });
    }

    const { counter, fn } = countingFindVisibility();
    const counted = await listMyInbox(ceo, { now: NOW_2026, findVisibility: fn });
    expect(counted.mine).toHaveLength(20);
    expect(counted.processed).toHaveLength(3);
    expect(counter.calls).toBeGreaterThan(0);
    expect(counter.calls).toBeLessThanOrEqual(2);
    const first = counter.calls;

    await listMyInbox(ceo, { now: NOW_2026, findVisibility: fn });
    expect(counter.calls).toBe(first * 2);

    expect(counted).toEqual(await listMyInbox(ceo, { now: NOW_2026 }));
  }, 60000);

  it("기안자 본인 연차 20건의 listMyLeave 한 번의 노출 조회는 2회 이하, 결과는 주입 없는 것과 같다", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    for (const d of WEEKDAYS.slice(0, 20)) await submitLeave(drafter, DAY(d), { now: NOW_2026 });

    const { counter, fn } = countingFindVisibility();
    const counted = await listMyLeave(drafter, { fiscalYear: 2026 }, { now: NOW_2026, findVisibility: fn });
    expect(counted).toHaveLength(20);
    expect(counter.calls).toBeGreaterThan(0);
    expect(counter.calls).toBeLessThanOrEqual(2);
    expect(counted).toEqual(await listMyLeave(drafter, { fiscalYear: 2026 }, { now: NOW_2026 }));
  }, 60000);
});

async function approvalRowCounts() {
  return [await countRows("approval_instances"), await countRows("approval_routes"), await countRows("approval_steps")];
}

describe("결재선 미리보기 RoutePreviewDTO(CX-R3)", () => {
  async function tracerOrg(): Promise<{ drafter: Viewer; lead: Viewer; ceo: Viewer }> {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    return { drafter, lead, ceo };
  }

  it("투영 켜짐 — 기안자 이름과 담당 이름, 빈 자리는 없고 아무것도 쓰지 않는다", async () => {
    const { drafter } = await tracerOrg();
    const before = await approvalRowCounts();
    const preview = await previewRoute(drafter, { kind: LEAVE_DOCUMENT_KIND }, { now: NOW_2026 });
    expect(preview).toEqual({
      drafterName: "박서연",
      steps: [
        { label: "팀장", holderNames: "김팀장", skipped: false },
        { label: "대표", holderNames: "최대표", skipped: false },
      ],
    });
    expect(await approvalRowCounts()).toEqual(before);
  });

  it("투영 꺼짐 — approval.value가 없는 계급에는 이름 필드도 이름 글자도 없다", async () => {
    const { drafter } = await tracerOrg();
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "approval.value", visible: false });
    const preview = await previewRoute(drafter, { kind: LEAVE_DOCUMENT_KIND }, { now: NOW_2026 });
    expect(preview.drafterName).toBeUndefined();
    expect(preview.steps.map((step) => Object.keys(step))).toEqual([
      ["label", "skipped"],
      ["label", "skipped"],
    ]);
    const json = JSON.stringify(preview);
    for (const name of ["박서연", "김팀장", "최대표"]) expect(json).not.toContain(name);
  });

  it("투영 꺼짐 · 기안자가 팀장 · skip — 1단은 {label: 팀장, skipped: true}로 남는다", async () => {
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "role.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "approval.value", visible: false });
    const preview = await previewRoute(lead, { kind: LEAVE_DOCUMENT_KIND }, { now: NOW_2026 });
    expect(preview.steps).toEqual([
      { label: "팀장", skipped: true },
      { label: "대표", skipped: false },
    ]);
  });

  it("CX2-W1 approval.value · role.value가 둘 다 없는 계급 — label은 순번 `N단`, 이름·계급 이름 없음", async () => {
    await tracerOrg();
    const role = await createRole(SYSTEM_VIEWER, { name: `새계급-${Date.now()}` });
    if (!role.id) throw new Error("계급 id가 없습니다");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "approval.value", visible: false });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "role.value", visible: false });
    const viewer = await makePerson("신입", role.id, "기획1팀");
    const preview = await previewRoute(viewer, { kind: LEAVE_DOCUMENT_KIND }, { now: NOW_2026 });
    expect(preview.drafterName).toBeUndefined();
    expect(preview.steps).toEqual([{ label: "1단" }, { label: "2단" }]);
    const json = JSON.stringify(preview);
    for (const text of ["신입", "김팀장", "최대표", "팀장", "대표"]) expect(json).not.toContain(text);
  });
});

describe("새 계급 노출 한계(CEO-10)", () => {
  it("알려진 한계 — 새 계급은 정보 노출표에서 결재·연차 정보를 켜야 함(TODOS): 결재함 줄은 잡히지만 DTO에 결재 필드가 없다", async () => {
    // 기획1팀에 팀장 없음 · 본부 책임자 없음 → 1·2단 빈 자리, 3단 경영관리팀의 새 계급 사람이 후보.
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const role = await createRole(SYSTEM_VIEWER, { name: `새계급-${Date.now()}` });
    if (!role.id) throw new Error("계급 id가 없습니다");
    const newcomer = await makePerson("새담당", role.id, "경영관리팀");
    await submitLeave(drafter, DAY(5), { now: NOW_2026 });

    const inbox = await listMyInbox(newcomer, { now: NOW_2026 });
    expect(inbox.mine).toHaveLength(1);
    expect(Object.keys(inbox.mine[0] ?? {})).toEqual([]);
  });
});

// ── 04.1-05: 결재함 상세(withDetails) ────────────────────────────────────────

function readCounts() {
  return {
    leaveRows: vi.mocked(findLeaveRequestsByIds).mock.calls.length,
    usage: vi.mocked(listLeaveUsage).mock.calls.length,
    adjustments: vi.mocked(listLeaveAdjustments).mock.calls.length,
    settings: vi.mocked(getSettingValue).mock.calls.length,
  };
}

function clearCounts() {
  vi.mocked(findLeaveRequestsByIds).mockClear();
  vi.mocked(listLeaveUsage).mockClear();
  vi.mocked(listLeaveAdjustments).mockClear();
  vi.mocked(getSettingValue).mockClear();
}

// 기획1팀(팀장 없음) 기안자 넷 — 지금 단계는 대표. 기안자마다 서로 다른 평일 perDrafter건.
async function fourDrafterInbox(perDrafter: number): Promise<{ ceo: Viewer; drafters: Viewer[] }> {
  const drafters = [];
  for (const name of ["박서연", "이준호", "최유진", "정다은"]) drafters.push(await makePerson(name, DEFAULT_ROLE_ID, "기획1팀"));
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  for (const [i, drafter] of drafters.entries()) {
    for (let j = 0; j < perDrafter; j++) {
      await submitLeave(drafter, DAY(WEEKDAYS[i * 5 + j] ?? 1), { now: NOW_2026 });
    }
  }
  return { ceo, drafters };
}

function balanceRowText(detail: { rows: { label: string; value: string }[] } | null | undefined): string[] {
  return (detail?.rows ?? []).filter((row) => row.label === "잔고").map((row) => row.value);
}

describe("결재함 상세 withDetails(CEO-17 · CEO-9 · ENG-17 · CXF2-B-RF01)", () => {
  it("기안자 4명 · 진행 중 20건 — 노출 ≤ 2 · 연차 행 읽기 2 · 사용 4 · 조정 4 · 설정 ≤ 연도 수, 20건 모두 상세, 결과는 주입 없는 것과 같다", async () => {
    const { ceo } = await fourDrafterInbox(5);
    const { counter, fn } = countingFindVisibility();
    clearCounts();
    const counted = await listMyInbox(ceo, { now: NOW_2026, withDetails: true, findVisibility: fn });
    const reads = readCounts();

    expect(counted.mine).toHaveLength(20);
    expect(counted.processed).toHaveLength(0);
    expect(counter.calls).toBeGreaterThan(0);
    expect(counter.calls).toBeLessThanOrEqual(2);
    expect(reads.leaveRows).toBe(2);
    expect(reads.usage).toBe(4);
    expect(reads.adjustments).toBe(4);
    expect(reads.settings).toBeLessThanOrEqual(1);
    for (const item of counted.mine) {
      expect(item.detail?.title).toMatch(/^연차 — 종일 /);
      expect(item.detail?.rows.length).toBeGreaterThan(0);
      expect(item.steps?.length).toBeGreaterThan(0);
      expect(item.actions).toEqual(["approve", "reject"]);
      expect(item.version).toBe(1);
    }

    expect(counted).toEqual(await listMyInbox(ceo, { now: NOW_2026, withDetails: true }));
  }, 60000);

  it("진행 중 5건(기안자 4명)이어도 연차 행 읽기는 2 그대로다(N+1 없음 — CXF2-B-RF02)", async () => {
    const drafters = [];
    for (const name of ["박서연", "이준호", "최유진", "정다은"]) drafters.push(await makePerson(name, DEFAULT_ROLE_ID, "기획1팀"));
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    for (const [i, drafter] of drafters.entries()) await submitLeave(drafter, DAY(WEEKDAYS[i] ?? 1), { now: NOW_2026 });
    await submitLeave(drafters[0] as Viewer, DAY(WEEKDAYS[10] ?? 1), { now: NOW_2026 });

    clearCounts();
    const inbox = await listMyInbox(ceo, { now: NOW_2026, withDetails: true });
    expect(inbox.mine).toHaveLength(5);
    expect(readCounts().leaveRows).toBe(2);
    expect(readCounts().usage).toBe(4);
  }, 60000);

  it("CEO-9 — 기안자의 입사일 · 퇴직일이 결재자 상세 직렬화에 없고, 잔고 행은 formatBalanceRow 결과와 같다", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    await setHireDate(SYSTEM_VIEWER, drafter.id, "2025-03-02");
    await setResignationDate(SYSTEM_VIEWER, drafter.id, "2026-12-30");
    const doc = await submitLeave(drafter, DAY(5), { now: NOW_2026 });

    const inbox = await listMyInbox(ceo, { now: NOW_2026, withDetails: true });
    const json = JSON.stringify(inbox);
    expect(json).not.toContain("2025-03-02");
    expect(json).not.toContain("2026-12-30");

    const balance = await getLeaveBalanceForRequest(ceo, doc.leaveId, { now: NOW_2026 });
    const expected = formatBalanceRow(balance as LeaveRequestBalanceDto, "full_day")?.map((line) => line.text);
    expect(balanceRowText(inbox.mine[0]?.detail)).toEqual(expected);
  });

  it("ENG-17 — 결재자 계급의 leave.value를 끄면 비고 값이 어느 행에도 없고, 켜면 비고 행에 있다 · 가능 행동 · version은 그대로", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    await submitLeave(drafter, { ...DAY(5), note: "비고-고유-5d2" }, { now: NOW_2026 });

    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "leave.value", visible: false });
    const hidden = await listMyInbox(lead, { now: NOW_2026, withDetails: true });
    expect(hidden.mine).toHaveLength(1);
    expect(JSON.stringify(hidden)).not.toContain("비고-고유-5d2");
    expect(hidden.mine[0]?.detail?.rows.some((row) => row.value.includes("비고-고유-5d2"))).toBe(false);
    expect(hidden.mine[0]?.actions).toEqual(["approve", "reject"]);
    expect(hidden.mine[0]?.version).toBe(1);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "leave.value", visible: true });
    const shown = await listMyInbox(lead, { now: NOW_2026, withDetails: true });
    expect(shown.mine[0]?.detail?.rows.find((row) => row.label === "비고")?.value).toBe("비고-고유-5d2");
  });

  it("CXF2-B-RF01 — 본인 승인이면 팀장 자기 문서 항목의 가능 행동이 [승인, 회수](반려 없음)이고 getApprovalView와 같다, 다른 사람 문서는 [승인, 반려]", async () => {
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, "self_approve");
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const own = await submitLeave(lead, DAY(5), { now: NOW_2026 });
    const other = await submitLeave(drafter, DAY(6), { now: NOW_2026 });

    const inbox = await listMyInbox(lead, { now: NOW_2026, withDetails: true });
    const ownItem = inbox.mine.find((item) => item.documentId === own.leaveId);
    const otherItem = inbox.mine.find((item) => item.documentId === other.leaveId);
    expect(ownItem?.actions).toEqual(["approve", "withdraw"]);
    const view = await getApprovalView(lead, { kind: LEAVE_DOCUMENT_KIND, documentId: own.leaveId }, { now: NOW_2026 });
    expect(view?.actions).toEqual(ownItem?.actions);
    expect(otherItem?.actions).toEqual(["approve", "reject"]);
  });
});
