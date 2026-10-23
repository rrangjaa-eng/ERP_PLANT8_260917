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
    expect(lines?.map((line) => line.label).sort()).toEqual(["켬", "일수", "이메일 알림", "예산"].sort());
    expect(lines?.find((line) => line.label === "예산")).toEqual({ label: "예산", before: "1,000,000", after: "2,500,000" });
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
    const byLabel = (label: string) => lines?.find((line) => line.label === label);
    expect(byLabel("지급 예정일")).toEqual({ label: "지급 예정일", before: "없음", after: "2026-11-03" });
    expect(byLabel("켬")).toEqual({ label: "켬", before: "켬", after: "끔" });
    expect(byLabel("일수")).toEqual({ label: "일수", before: "1,234,567", after: "0" });
    expect(byLabel("받는 계급")).toEqual({ label: "받는 계급", before: "없음", after: "a, b" });
    expect(byLabel("값")).toMatchObject({ before: "바뀜", after: "바뀜" });
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

// 07-25 고침 뒤(DOM 감사 P2-3): jsonb는 키를 길이 · 사전 순으로 저장해 Object.entries 순서가 쓰는 쪽의 순서와 무관하다.
// 줄 순서는 칸 이름 표(CHANGE_FIELD_LABELS)가 선언된 순서(= 폼 순서) → 표에 없는 키는 키 글자 사전 순이다.
// 오케스트레이터 결정으로 SC-08 계약 공백을 메운 것이다(되돌릴 수 있음).
describe("줄 순서 (07-25 DOM 감사 P2-3)", () => {
  const labelsOf = (changes: Record<string, unknown>) => detailLines({ changes })?.map((line) => line.label);

  it("칸 이름 표에 선언된 순서를 따른다(넣은 순서와 무관)", () => {
    const keys = Object.keys(CHANGE_FIELD_LABELS);
    const pick = ["password", "rrn", "accountNumber", "emailEnabled", "name"];
    const expected = [...pick].sort((a, b) => keys.indexOf(a) - keys.indexOf(b)).map((key) => CHANGE_FIELD_LABELS[key]);
    const shuffled = Object.fromEntries(pick.map((key) => [key, ["a", "b"]]));
    expect(labelsOf(shuffled)).toEqual(expected);
    expect(labelsOf(Object.fromEntries([...pick].reverse().map((key) => [key, ["a", "b"]])))).toEqual(expected);
  });

  it("이름 표에 없는 키는 표에 있는 칸 뒤에 키 사전 순으로", () => {
    const labels = labelsOf({ zeta: [1, 2], "tax.vat.rate": [0.1, 0.12], password: ["a", "b"], "auth.lockout.threshold": [5, 10], memo: ["x", "y"] });
    expect(labels?.[0]).toBe("비밀번호");
    expect(labels?.slice(1)).toEqual(["잠금 횟수", "memo", "부가세율", "zeta"]);
  });

  it("jsonb가 키를 길이순으로 돌려줘도(짧은 키가 앞) 같은 순서", () => {
    const byLength = { rrn: ["a", "b"], memo: ["x", "y"], password: ["a", "b"], "tax.vat.rate": [1, 2], accountNumber: ["1111", "2222"] };
    const reversed = Object.fromEntries(Object.entries(byLength).reverse());
    expect(labelsOf(byLength)).toEqual(labelsOf(reversed));
    expect(labelsOf(byLength)?.[0]).toBe("계좌번호");
  });
});

// 07-25 고침 뒤(DOM 감사 P3-7): 이전 · 이후가 둘 다 「없음」이면 바뀐 것이 없는 줄이라 표 칸 · 시트 · 개수에서 함께 뺀다.
describe("없음 → 없음 줄 제외 (07-25 DOM 감사 P3)", () => {
  it("둘 다 없음인 줄은 빼고 나머지는 남긴다", () => {
    const lines = detailLines({ changes: { name: [null, null], days: [3, 5], enabled: ["", []] } });
    expect(lines).toEqual([{ label: "일수", before: "3", after: "5" }]);
  });

  it("전부 둘 다 없음이면 changes가 없는 행과 같다(null)", () => {
    expect(detailLines({ changes: { name: [null, null], days: [undefined, null] } })).toBeNull();
  });

  it("없음 → 값 · 값 → 없음은 남긴다 · 바뀜 → 바뀜(민감 칸)도 남긴다", () => {
    const lines = detailLines({ changes: { name: [null, "A"], days: [3, null], password: ["a", "b"] } });
    expect(lines).toHaveLength(3);
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
