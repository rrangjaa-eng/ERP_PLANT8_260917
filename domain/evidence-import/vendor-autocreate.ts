import { recordAction } from "@/domain/action-log/record";
import type { FinalLine, FormatRule } from "@/domain/evidence-import/types";
import type { Viewer } from "@/domain/viewer";
import { businessNoProblem, normalizeVendorName } from "@/domain/vendors";
import { vendorKindToAdd } from "@/domain/vendors/kind";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findVendorsByBusinessNoDigitsList as defaultFindVendorsByBusinessNoDigitsList,
  insertVendor,
  setVendorArchived,
  updateVendor,
  type VendorBusinessNoListMatch,
} from "@/repositories/vendors";

// 06.1-04 Task 3(EVID-11): 사업자번호 서식 줄의 공급자 → 거래처 연결 · 되살림 · 협력사 생성 · 고객 전용 올림 · 이름 다름(알림만).
// D-6114 — 등록 권한만으로 생성 · 되살림, 행동 로그 필수(끌 수 없는 evidence_vendor_* 세 종류 · detail에 묶음 id).
// 거래처 잠금과 「새 줄만」 거르기는 부르는 쪽(등록 서비스 트랜잭션 첫머리)이 한다. 여기는 그 트랜잭션의 tx 리포지토리와 판정만이고,
// 거래처 관리 · 보관함 메뉴의 권한 판정을 부르지 않는다(등록 서비스 첫 줄의 증빙 등록 쓰기 판정 하나로 끝난다).

export const BAD_BUSINESS_NO_CHECK = "사업자번호 틀림 · 거래처 확인";
const VENDOR_ENTITY = "vendor";

type VendorLine = Pick<FinalLine, "businessNoDigits" | "nameOnDocument" | "evidenceType" | "needsCheck">;

export type EnsureVendorsDeps = { findVendorsByBusinessNoDigitsList: typeof defaultFindVendorsByBusinessNoDigitsList };

export type VendorLinkResult<T> = {
  lines: (T & { vendorId: string | null })[];
  created: number;
  restored: number;
  /** `{번호} · 파일 {파일 상호} · 등록 {등록 이름}` — 같은 글자는 한 번. */
  nameMismatchLines: string[];
};

type LinkedVendor = { id: string; name: string; made: "created" | "restored" | null };

function formatBusinessNo(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// RP-7: 검증 숫자가 맞는 번호만 거래처 단계로 간다 — 틀린 번호로 찾거나 만들면 엉뚱한 거래처에 붙는다.
function vendorDigitsOf(line: VendorLine): string | null {
  return line.businessNoDigits !== null && businessNoProblem(line.businessNoDigits) === null ? line.businessNoDigits : null;
}

// 번호 하나 → 살아 있는 행(숨김 포함)에 붙고, 없으면 조회 순서 첫 보관 행을 되살리고, 둘 다 없으면 협력사로 만든다
// (260907 receipts.ts findOrCreateVendor와 같은 차례). 살아 있는 행은 유일 색인 때문에 하나뿐이다.
async function vendorForDigits(
  viewer: Viewer,
  digits: string,
  found: readonly VendorBusinessNoListMatch[],
  first: VendorLine,
  batchId: string,
  tx: DbOrTx,
): Promise<LinkedVendor | null> {
  const live = found.find((match) => match.archivedAt === null);
  const target = live ?? found[0];
  if (target) {
    let made: LinkedVendor["made"] = null;
    if (!live && (await setVendorArchived(viewer, target.id, false, tx))) {
      await recordAction(viewer, { actionType: "evidence_vendor_restore", entity: VENDOR_ENTITY, entityId: target.id, detail: { batchId } }, { tx });
      made = "restored";
    }
    // D31: 숨기지 않은 고객 전용 거래처에 협력사 증빙이 붙으면 둘 다로 올린다. 숨긴 거래처는 사람이 정리한 것이라 그대로 둔다.
    if (!target.hidden && vendorKindToAdd(target.kind, "supplier", false) !== null) {
      await updateVendor(viewer, target.id, { kind: "both" }, tx);
      // RP-7(06.1-CONTEXT.md:89): 전 · 후 구분을 남긴다.
      await recordAction(
        viewer,
        { actionType: "evidence_vendor_kind_change", entity: VENDOR_ENTITY, entityId: target.id, detail: { batchId, kind: { from: target.kind, to: "both" } } },
        { tx },
      );
    }
    return { id: target.id, name: target.name, made };
  }
  // 상호를 못 읽으면 만들지 않는다 — 이름 없는 거래처가 생긴다(260907 receipts.ts:3248). first는 그 번호에서 상호가 있는 첫 줄이다.
  if (first.nameOnDocument === null) return null;
  const row = await insertVendor(
    viewer,
    {
      name: first.nameOnDocument,
      normalizedName: normalizeVendorName(first.nameOnDocument),
      businessNo: formatBusinessNo(digits),
      defaultEvidenceType: first.evidenceType,
      kind: "supplier",
    },
    tx,
  );
  await recordAction(viewer, { actionType: "evidence_vendor_create", entity: VENDOR_ENTITY, entityId: row.id, detail: { batchId } }, { tx });
  return { id: row.id, name: row.name, made: "created" };
}

// 줄들(이미 등록된 줄은 부르는 쪽이 뺐다) → 줄마다 vendorId. 번호 집합 전체를 한 번 조회하고(B-F14), 이름이 달라도 등록 이름은
// 그대로 두고 결과로만 알린다. 생성 · 되살림 · 올림은 같은 tx의 행동 로그와 함께다.
export async function ensureVendorsForLines<T extends VendorLine>(
  viewer: Viewer,
  lines: readonly T[],
  format: FormatRule,
  batchId: string,
  tx: DbOrTx,
  deps?: Partial<EnsureVendorsDeps>,
): Promise<VendorLinkResult<T>> {
  if (!format.createsVendor) return { lines: lines.map((line) => ({ ...line, vendorId: null })), created: 0, restored: 0, nameMismatchLines: [] };

  // 번호마다 상호가 있는 첫 줄(없으면 첫 줄) — 260907은 줄마다 판정해 첫 줄에 상호가 없으면 다음 줄의 상호로 만들었다(receipts.ts:3248).
  const firstByDigits = new Map<string, T>();
  for (const line of lines) {
    const digits = vendorDigitsOf(line);
    if (digits === null) continue;
    const held = firstByDigits.get(digits);
    if (held === undefined || (held.nameOnDocument === null && line.nameOnDocument !== null)) firstByDigits.set(digits, line);
  }
  const lookup = deps?.findVendorsByBusinessNoDigitsList ?? defaultFindVendorsByBusinessNoDigitsList;
  const matches = firstByDigits.size === 0 ? [] : await lookup(viewer, [...firstByDigits.keys()], tx);

  const vendorByDigits = new Map<string, LinkedVendor | null>();
  for (const [digits, first] of firstByDigits) {
    vendorByDigits.set(digits, await vendorForDigits(viewer, digits, matches.filter((match) => match.digits === digits), first, batchId, tx));
  }

  const nameMismatchLines = new Set<string>();
  const linked = lines.map((line) => {
    const digits = vendorDigitsOf(line);
    if (digits === null) {
      return line.businessNoDigits === null ? { ...line, vendorId: null } : { ...line, vendorId: null, needsCheck: line.needsCheck ?? BAD_BUSINESS_NO_CHECK };
    }
    const vendor = vendorByDigits.get(digits) ?? null;
    if (vendor !== null && line.nameOnDocument !== null && normalizeVendorName(line.nameOnDocument) !== normalizeVendorName(vendor.name)) {
      nameMismatchLines.add(`${formatBusinessNo(digits)} · 파일 ${line.nameOnDocument} · 등록 ${vendor.name}`);
    }
    return { ...line, vendorId: vendor?.id ?? null };
  });

  const made = [...vendorByDigits.values()].map((vendor) => vendor?.made ?? null);
  return {
    lines: linked,
    created: made.filter((value) => value === "created").length,
    restored: made.filter((value) => value === "restored").length,
    nameMismatchLines: [...nameMismatchLines],
  };
}
