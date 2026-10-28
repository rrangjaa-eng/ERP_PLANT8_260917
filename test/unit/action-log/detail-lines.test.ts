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

  it("계급 id(role-…)는 UUID처럼 바뀜 · 개수로 줄인다 — 이름 풀이는 DB 조회가 필요해 뒤 결정", () => {
    const lines = detailLines({
      changes: {
        roleId: ["role-team-lead", "role-3f2a9c10-1b2c-4d3e-8f40-0123456789ab"],
        extraRoleIds: [[], ["role-sysadmin", "role-ceo"]],
      },
    });
    expect(lines?.[0]).toEqual({ label: "계급", before: "바뀜", after: "바뀜" });
    expect(lines?.[1]).toEqual({ label: "받는 계급", before: "없음", after: "2개" });
    expect(detailLines({ changes: { roleId: [null, "role-sysadmin"] } })?.[0]).toEqual({ label: "계급", before: "없음", after: "바뀜" });
  });

  it("업무 범위 · 보는 범위는 계급 화면과 같은 한글 라벨로 보인다", () => {
    const lines = detailLines({ changes: { workScope: ["team", "company"], viewScope: ["own", "org_unit"] } });
    expect(lines?.find((line) => line.label === "업무 범위")).toEqual({ label: "업무 범위", before: "자기 팀", after: "전사" });
    expect(lines?.find((line) => line.label === "보는 범위")).toEqual({ label: "보는 범위", before: "본인", after: "본부" });
    expect(detailLines({ changes: { viewScope: ["team", "company"] } })?.[0]).toMatchObject({ before: "팀", after: "전사" });
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
// 07.1-04 PE3 · PE2: 카드 사용 덮기 로그(evidence_record_amount_change)의 전후 줄.
describe("카드 사용 덮기 줄 (07.1-04 PE3 · PE2)", () => {
  it("사용일 · 결제 합계 — 라벨 표 선언 차례 · 숫자 쉼표", () => {
    expect(detailLines({ changes: { totalKrw: [50000, 52000], usedOn: ["2026-10-01", "2026-10-03"] } })).toEqual([
      { label: "사용일", before: "2026-10-01", after: "2026-10-03" },
      { label: "결제 합계", before: "50,000", after: "52,000" },
    ]);
  });

  // PR #305 검토 P2: 카드만 · 날짜만 바뀐 덮기도 줄이 남는다 — 카드 끝 4자리 · 공급가 · 부가세 라벨, 폼 차례(사용일 → 카드 → 합계 → 공급가 → 부가세 → 승인번호).
  it("카드 · 공급가 · 부가세 — 라벨 · 차례", () => {
    expect(detailLines({ changes: { approvalNo: [null, "A1"], vatKrw: [40000, 21818], supplyKrw: [200000, 218182], cardLast4: ["1111", "2222"], usedOn: ["2026-04-30", "2026-04-28"] } })).toEqual([
      { label: "사용일", before: "2026-04-30", after: "2026-04-28" },
      { label: "카드", before: "1111", after: "2222" },
      { label: "공급가", before: "200,000", after: "218,182" },
      { label: "부가세", before: "40,000", after: "21,818" },
      { label: "승인번호", before: "없음", after: "A1" },
    ]);
  });

  it("승인번호 채움 — 빈 이전 값은 `없음`", () => {
    expect(detailLines({ changes: { approvalNo: [null, "A1"] } })).toEqual([{ label: "승인번호", before: "없음", after: "A1" }]);
  });
});

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

describe("changes 없는 기존 기록의 대체 줄 (07-25 Codex P2)", () => {
  const PAYMENT_CANCEL = { actionType: "payment_cancel", entity: "payment" };
  it("지급 취소: 사유 · 지급일 · 금액이 줄로 나온다(내부 id는 제외)", () => {
    const lines = detailLines({ paymentId: "6f1f2c1e-0000-4000-8000-000000000001", reason: "계좌 오입력", payDate: "2026-10-01", transferKrw: 1100000, payableKrw: 1000000 }, PAYMENT_CANCEL);
    expect(lines).toEqual([
      { label: "사유", before: "없음", after: "계좌 오입력" },
      { label: "지급일", before: "없음", after: "2026-10-01" },
      { label: "이체 금액", before: "없음", after: "1,100,000" },
      { label: "지급 금액", before: "없음", after: "1,000,000" },
    ]);
  });

  it("지급 처리도 같은 대체 줄을 쓴다", () => {
    expect(detailLines({ reason: "차액", payDate: "2026-10-01" }, { actionType: "payment_process", entity: "payment" })).toHaveLength(2);
  });

  it("증빙 면제: 사유 한 줄", () => {
    expect(detailLines({ reason: "소액 영수증 없음" }, { actionType: "evidence_waive", entity: "expense" })).toEqual([{ label: "사유", before: "없음", after: "소액 영수증 없음" }]);
  });

  it("거래처 계좌 변경: 끝 4자리 전후 한 줄 + 출처는 한글", () => {
    expect(detailLines({ beforeLast4: "1234", afterLast4: "5678", source: "admin" }, { actionType: "vendor_account_change", entity: "vendor" })).toEqual([
      { label: "계좌번호", before: "····1234", after: "····5678" },
      { label: "출처", before: "없음", after: "관리자 화면" },
    ]);
  });

  it("업무 중 거래처 등록(document_create + vendor + source workplace): 출처와 계좌 끝 4자리", () => {
    expect(detailLines({ source: "workplace", beforeLast4: null, afterLast4: "5678" }, { actionType: "document_create", entity: "vendor" })).toEqual([
      { label: "계좌번호", before: "없음", after: "····5678" },
      { label: "출처", before: "없음", after: "업무 중 등록" },
    ]);
  });

  it("work_vendor_create 종류도 업무 중 거래처 등록으로 본다", () => {
    expect(detailLines({ source: "workplace" }, { actionType: "work_vendor_create", entity: "vendor" })).toEqual([{ label: "출처", before: "없음", after: "업무 중 등록" }]);
  });

  it("알려지지 않은 종류의 reason은 줄로 만들지 않는다(내부 코드값 노출 방지)", () => {
    expect(detailLines({ reason: "excluded" }, { actionType: "cert_review", entity: "cert" })).toBeNull();
    expect(detailLines({ reason: "manual" }, { actionType: "cert_event", entity: "cert" })).toBeNull();
    expect(detailLines({ reason: "register_person_rollback" }, { actionType: "person_register", entity: "person" })).toBeNull();
  });

  it("종류를 모르면(context 없음) 대체 줄이 없다", () => {
    expect(detailLines({ reason: "excluded" })).toBeNull();
    expect(detailLines({ reason: "소액 영수증 없음" })).toBeNull();
  });

  it("document_create라도 vendor · workplace가 아니면 null", () => {
    expect(detailLines({ source: "workplace" }, { actionType: "document_create", entity: "expense" })).toBeNull();
    expect(detailLines({ source: "admin" }, { actionType: "document_create", entity: "vendor" })).toBeNull();
  });

  it("알 수 없는 키만 있으면 null · changes가 있으면 changes가 우선", () => {
    expect(detailLines({ paymentId: "x", foo: 1 }, PAYMENT_CANCEL)).toBeNull();
    expect(detailLines({ reason: "무시", changes: { days: [3, 5] } }, PAYMENT_CANCEL)).toEqual([{ label: "일수", before: "3", after: "5" }]);
  });
});

// 07.1-13 S8: 사람 입사일 · 퇴직일 바꾸기 로그(setEmploymentDate)의 전후 줄.
describe("입사일 · 퇴직일 줄 (07.1-13 S8)", () => {
  it("입사일 전후 · 퇴직일 없음 → 날짜", () => {
    expect(detailLines({ field: "hire_date", changes: { hireDate: ["2026-01-02", "2026-02-01"] } })).toEqual([
      { label: "입사일", before: "2026-01-02", after: "2026-02-01" },
    ]);
    expect(detailLines({ field: "resignation_date", changes: { resignationDate: [null, "2026-12-31"] } })).toEqual([
      { label: "퇴직일", before: "없음", after: "2026-12-31" },
    ]);
  });
});

// 07.1-13 S8(E-P2-40 · CG-09): 견적 · 매출 줄의 전후는 detail.lineChanges = [{ id, kind, no, name, changes }] 배열이다.
describe("줄 전후 lineChanges (07.1-13 S8)", () => {
  const LINE_ID = "3f0c3a7e-9b1d-4c55-8f0e-0a1b2c3d4e5f";
  const VENDOR_A = "0f0c3a7e-9b1d-4c55-8f0e-0a1b2c3d4e51";
  const VENDOR_B = "0f0c3a7e-9b1d-4c55-8f0e-0a1b2c3d4e52";

  it("견적 줄 — {줄 종류} {순번} {항목명} {칸}", () => {
    const detail = { lineIds: [LINE_ID], lineChanges: [{ id: LINE_ID, kind: "quote", no: 2, name: "무대", changes: { unitPrice: ["10,000원", "12,000원"] } }] };
    expect(detailLines(detail)).toEqual([{ label: "견적 줄 2 무대 단가", before: "10,000원", after: "12,000원" }]);
  });

  it("발행 줄 · 입금 줄 — 항목명 없음 · 열 이름", () => {
    const detail = {
      lineChanges: [
        { id: LINE_ID, kind: "issue", no: 1, name: null, changes: { amount: ["1,000,000원", "1,100,000원"] } },
        { id: LINE_ID, kind: "payment", no: 1, name: null, changes: { entryDate: [null, "2026-10-01"] } },
      ],
    };
    expect(detailLines(detail)).toEqual([
      { label: "발행 줄 1 발행액", before: "1,000,000원", after: "1,100,000원" },
      { label: "입금 줄 1 입금일", before: "없음", after: "2026-10-01" },
    ]);
  });

  it("상태는 화면 낱말 · 거래처는 바뀜 · 칸 순서는 선언 순서", () => {
    const detail = {
      lineChanges: [
        { id: LINE_ID, kind: "quote", no: 1, name: "조명", changes: { lineStatus: ["not_started", "cancelled"], vendorId: [VENDOR_A, VENDOR_B], quantity: ["1.00", "2.00"] } },
      ],
    };
    expect(detailLines(detail)).toEqual([
      { label: "견적 줄 1 조명 거래처", before: "바뀜", after: "바뀜" },
      { label: "견적 줄 1 조명 수량", before: "1.00", after: "2.00" },
      { label: "견적 줄 1 조명 상태", before: "미착수", after: "취소" },
    ]);
  });

  it("모르는 kind · 모르는 칸 · 레코드 아닌 원소 · changes 아닌 원소는 줄을 만들지 않는다", () => {
    const detail = {
      lineChanges: [
        { id: LINE_ID, kind: "mystery", no: 1, name: null, changes: { amount: [1, 2] } },
        { id: LINE_ID, kind: "quote", no: 1, name: "무대", changes: { sortOrder: [1, 2], version: [1, 2] } },
        "문자열",
        null,
        [1, 2],
        { id: LINE_ID, kind: "quote", no: 1, name: "무대", changes: "바뀜" },
      ],
    };
    expect(detailLines(detail)).toBeNull();
  });

  it("항목명이 비면 빼고 띄어쓰기 하나 · 둘 다 없음이면 뺀다", () => {
    const detail = { lineChanges: [{ id: LINE_ID, kind: "quote", no: 3, name: "", changes: { note: [null, "메모"], subcategory: [null, ""] } }] };
    expect(detailLines(detail)).toEqual([{ label: "견적 줄 3 비고", before: "없음", after: "메모" }]);
  });

  it("changes와 lineChanges가 함께면 changes 줄 먼저", () => {
    const detail = {
      changes: { preEstimate: ["1,000,000원", "1,200,000원"] },
      lineChanges: [{ id: LINE_ID, kind: "issue", no: 2, name: null, changes: { note: ["가", "나"] } }],
    };
    expect(detailLines(detail)).toEqual([
      { label: "사전 견적", before: "1,000,000원", after: "1,200,000원" },
      { label: "발행 줄 2 메모", before: "가", after: "나" },
    ]);
  });

  it("같은 항목명 줄 둘은 줄마다 따로 남는다(CG-09)", () => {
    const detail = {
      lineChanges: [
        { id: LINE_ID, kind: "quote", no: 1, name: "무대", changes: { unitPrice: ["10,000원", "12,000원"] } },
        { id: VENDOR_A, kind: "quote", no: 2, name: "무대", changes: { unitPrice: ["10,000원", "12,000원"] } },
      ],
    };
    expect(detailLines(detail)?.map((line) => line.label)).toEqual(["견적 줄 1 무대 단가", "견적 줄 2 무대 단가"]);
  });

  it("lineChanges 없는 기존 견적 줄 로그(lineIds만)는 지금처럼 null", () => {
    expect(detailLines({ lineIds: [LINE_ID], archivedLineIds: [VENDOR_A] })).toBeNull();
  });
});

// 07.1-14(E-P2-41): 사람 본부 칸 로그는 id가 아니라 본부 이름 글자를 담는다 — 라벨 `본부` · 빈 값 `없음`.
describe("detailLines — 사람 본부(07.1-14 E-P2-41)", () => {
  it("본부를 비우면 본부 · {이전} → 없음", () => {
    expect(detailLines({ changes: { division: ["경영관리본부", null] } })).toEqual([{ label: "본부", before: "경영관리본부", after: "없음" }]);
  });

  it("본부를 처음 넣으면 본부 · 없음 → {이후}", () => {
    expect(detailLines({ changes: { division: [null, "영업본부"] } })).toEqual([{ label: "본부", before: "없음", after: "영업본부" }]);
  });
});
