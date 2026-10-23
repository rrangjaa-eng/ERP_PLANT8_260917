import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChanges } from "@/domain/action-log/changes";
import { CHANGE_FIELD_LABELS, detailLines } from "@/domain/action-log/detail-lines";

// 07-25 K16: 읽는 쪽 줄 함수 — 바뀐 칸 전부를 사람이 읽는 줄로 돌려준다(자르기는 표 칸 몫).
describe("detailLines (07-25 K16)", () => {
  it("설정 한 칸은 설정 레지스트리 라벨과 [이전, 이후] 글자로", () => {
    const lines = detailLines({ key: "tax.vat.rate", changes: { value: [0.1, 0.12] } });
    expect(lines).toEqual([{ label: "부가세율", before: "0.1", after: "0.12" }]);
  });

  it("칸 넷이 바뀌면 네 줄 전부를 돌려준다(자르지 않는다)", () => {
    const lines = detailLines({
      changes: {
        enabled: [false, true],
        days: [3, 5],
        emailEnabled: [true, false],
        budgetKrw: [1000000, 2500000],
      },
    });
    expect(lines).toHaveLength(4);
    expect(lines?.map((line) => line.label)).toEqual(["켬", "일수", "이메일 알림", "예산"]);
    expect(lines?.[3]).toEqual({ label: "예산", before: "1,000,000", after: "2,500,000" });
  });

  it("changes가 없거나 비어 있으면 null", () => {
    expect(detailLines(null)).toBeNull();
    expect(detailLines(undefined)).toBeNull();
    expect(detailLines({})).toBeNull();
    expect(detailLines({ format: "json" })).toBeNull();
    expect(detailLines({ changes: {} })).toBeNull();
    expect(detailLines({ changes: [] as unknown as Record<string, unknown> })).toBeNull();
  });

  it("쓰는 쪽이 놓친 민감 칸 원값도 렌더 쪽이 한 번 더 가린다", () => {
    const lines = detailLines({
      changes: {
        accountNumber: ["110123451234", "220987655678"],
        rrn: ["900101-1234567", "900101-7654321"],
        password: ["old-secret", "new-secret"],
      },
    });
    expect(lines?.[0]).toEqual({ label: "계좌번호", before: "····1234", after: "····5678" });
    expect(lines?.[1]).toEqual({ label: "주민등록번호", before: "바뀜", after: "바뀜" });
    expect(lines?.[2]).toEqual({ label: "비밀번호", before: "바뀜", after: "바뀜" });
    expect(JSON.stringify(lines)).not.toMatch(/1101234|2209876|1234567|7654321|secret/);
  });

  it("쓰는 쪽이 이미 가린 값은 그대로", () => {
    const lines = detailLines({ changes: { bankAccountNo: ["····6789", "····0123"], password: ["바뀜", "바뀜"] } });
    expect(lines?.[0]).toEqual({ label: "계좌번호", before: "····6789", after: "····0123" });
    expect(lines?.[1]?.before).toBe("바뀜");
  });

  it("값 글자: 없음 · 켬/끔 · 날짜 · 쉼표 · 배열 · 객체", () => {
    const lines = detailLines({
      changes: {
        scheduledPaymentDate: [null, "2026-11-03T00:00:00.000Z"],
        enabled: [true, false],
        days: [1234567, 0],
        extraRoleIds: [[], ["a", "b"]],
        value: [{ a: 1 }, { a: 2 }],
      },
    });
    expect(lines?.[0]).toEqual({ label: "지급 예정일", before: "없음", after: "2026-11-03" });
    expect(lines?.[1]).toEqual({ label: "켬", before: "켬", after: "끔" });
    expect(lines?.[2]).toEqual({ label: "일수", before: "1,234,567", after: "0" });
    expect(lines?.[3]).toEqual({ label: "받는 계급", before: "없음", after: "a, b" });
    expect(lines?.[4]?.before).toBe("바뀜");
    expect(lines?.[4]?.after).toBe("바뀜");
  });

  it("UUID 값은 글자로 보이지 않고 바뀜 · 개수로 줄인다", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const lines = detailLines({ changes: { roleId: [id, id.replace("123e", "223e")], extraRoleIds: [[], [id, id]] } });
    expect(lines?.[0]).toEqual({ label: "계급", before: "바뀜", after: "바뀜" });
    expect(lines?.[1]).toEqual({ label: "받는 계급", before: "없음", after: "2개" });
  });

  it("권한 칸은 메뉴 라벨 + 동작 낱말, 정보 항목 칸은 항목 이름", () => {
    const allowed = detailLines({ menu: "projects", action: "write", changes: { allowed: [null, true] } });
    expect(allowed?.[0]?.label).toBe("프로젝트 쓰기");
    expect(allowed?.[0]).toMatchObject({ before: "없음", after: "켬" });
    const visible = detailLines({ infoItem: "action_log.detail", changes: { visible: [true, false] } });
    expect(visible?.[0]?.label).toBe("행동 로그 상세");
  });

  it("설정 가져오기의 「키@적용 시작일」 칸은 설정 라벨 + 날짜", () => {
    const lines = detailLines({ changes: { "tax.vat.rate@2027-01-01": [0.1, 0.12] } });
    expect(lines?.[0]?.label).toBe("부가세율 · 2027-01-01부터");
    expect(lines?.[0]?.label).not.toContain("@");
  });

  it("이름 표에 없는 키는 키 글자 그대로 — JSON이 아니다(AQ-40)", () => {
    const lines = detailLines({ changes: { someFutureField: [1, 2] } });
    expect(lines?.[0]).toEqual({ label: "someFutureField", before: "1", after: "2" });
  });

  it("buildChanges 결과를 그대로 읽는다(쓰는 쪽 ↔ 읽는 쪽)", () => {
    const changes = buildChanges({ name: "A", workScope: "team" }, { name: "B", workScope: "all" });
    expect(detailLines({ changes })?.map((line) => line.label)).toEqual(["이름", "업무 범위"]);
  });
});

// AQ-40: 07-04가 쓰는 칸 키와 07-24 budgetKrw는 전부 이름이 있다. 07 뒤 새 키가 이름 없이 들어오면 깨진다.
describe("칸 이름 표 대조 (AQ-40)", () => {
  const WRITTEN_KEYS = [
    "allowed", "visible", "name", "workScope", "viewScope", "budgetKrw", "value", "scheduledPaymentDate", "roleId",
    "enabled", "days", "extraRoleIds", "emailEnabled",
  ];

  it("쓰는 쪽 키 전부에 이름이 있다", () => {
    for (const key of WRITTEN_KEYS) expect(CHANGE_FIELD_LABELS, key).toHaveProperty(key);
  });

  it("domain/ 소스의 buildChanges({ 키: … }) 첫 칸 키도 전부 이름이 있다", () => {
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts")) {
          for (const match of readFileSync(path, "utf8").matchAll(/buildChanges\(\s*\{\s*(\w+)\s*:/g)) found.add(match[1] as string);
        }
      }
    };
    walk(join(process.cwd(), "domain"));
    expect(found.size).toBeGreaterThan(0);
    for (const key of found) expect(CHANGE_FIELD_LABELS, key).toHaveProperty(key);
  });
});
