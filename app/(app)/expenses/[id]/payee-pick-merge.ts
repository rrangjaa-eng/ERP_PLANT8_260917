// 06.5 V12 R-1: 지급처 고르기 — 거래처 후보와 직원 후보를 합친 뒤 이름순 한 목록(같은 이름이면 거래처 먼저 → id 순으로 매번 같은 순서)을 만들고
// 모두 합쳐 50행에서 자른다(종류별 50행씩이 아니다 — SYSTEM §7-17-1 「한 번에 50행」을 목록 하나로 지킨다). 넘침은 둘 중 하나라도 서버에서 잘렸거나
// 합이 50을 넘을 때. 상한은 domain/expenses/pick.ts의 PICK_LIMIT과 같은 값을 이 잎 모듈에 둔다(클라이언트가 서버 모듈을 import하지 않게 —
// 같음은 단위 시험이 잰다).

export const PAYEE_PICK_LIMIT = 50;

type Named = { id: string; name: string };

export type PayeePickEntry<V extends Named, U extends Named> = { kind: "vendor"; row: V } | { kind: "user"; row: U };

const collator = new Intl.Collator("ko");

export function mergePayeePickRows<V extends Named, U extends Named>(input: {
  vendors: readonly V[];
  users: readonly U[];
  vendorsTruncated: boolean;
  usersTruncated: boolean;
}): { rows: PayeePickEntry<V, U>[]; truncated: boolean } {
  const all: PayeePickEntry<V, U>[] = [
    ...input.vendors.map((row) => ({ kind: "vendor" as const, row })),
    ...input.users.map((row) => ({ kind: "user" as const, row })),
  ];
  all.sort(
    (a, b) =>
      collator.compare(a.row.name, b.row.name) ||
      (a.kind === b.kind ? 0 : a.kind === "vendor" ? -1 : 1) ||
      (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
  );
  return {
    rows: all.slice(0, PAYEE_PICK_LIMIT),
    truncated: input.vendorsTruncated || input.usersTruncated || all.length > PAYEE_PICK_LIMIT,
  };
}
