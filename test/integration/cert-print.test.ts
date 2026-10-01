import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { project } from "@/domain/permissions/project";
import {
  CERTIFICATE_PRINT_DTO_SPEC,
  type CertificatePrintRow,
  correctSubmission,
  getCertificatePrint,
} from "@/domain/certs/review";
import { decrypt } from "@/lib/crypto";
import type { SignatureStore } from "@/lib/storage/signature-store";
import { seedSubmittedCert, signaturePngFixture } from "@/test/e2e/helpers/cert";
import {
  FULL_GRANT,
  countLogs,
  grantCertReview,
  makeReviewer,
  makeUser,
} from "@/test/integration/cert-review-fixtures";

// 04.3-11 Task 1 — 인쇄 DTO(D-1108): 저장된 가린 번호만 싣고 복호화하지 않는다. 권한 · 파기 · 게이트 ·
// 대표 차단 · 정보 항목 꺼짐은 모두 notFound. 표본은 seedSubmittedCert()로만 만든다.

vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return { ...actual, decrypt: vi.fn(actual.decrypt) };
});

beforeEach(async () => {
  vi.mocked(decrypt).mockClear();
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

function storeWith(png: Buffer | null): SignatureStore {
  return {
    put: () => Promise.resolve(),
    get: () => Promise.resolve(png),
    delete: () => Promise.resolve(),
  };
}

const PRINTED_AT = new Date("2026-09-21T00:12:00.000Z"); // KST 2026-09-21 09:12

describe("getCertificatePrint — 가린 번호만 · 복호화 없음", () => {
  it("택배 확인증 → 값 칸 전부 · 출력 시각(KST) · 서명 data URL · 13자리 번호 없음 · 복호화 0번 · mask_reveal 0줄", async () => {
    const seeded = await seedSubmittedCert({ delivery: "parcel", address: "서울시 마포구 월드컵로 1" });
    const viewer = await makeReviewer(FULL_GRANT);

    const result = await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, {
      signatureStore: storeWith(signaturePngFixture()),
      now: () => PRINTED_AT,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.print).toMatchObject({
      certNo: seeded.certNo,
      eventName: seeded.eventName,
      wonOn: "2026-01-01",
      prizeName: "갤럭시 탭 S10",
      quantity: 1,
      name: "김하늘",
      rrnMasked: "930412-2******",
      phone: "010-4821-7730",
      address: "서울시 마포구 월드컵로 1",
    });
    expect(result.print.signatureDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(typeof result.print.submittedAt).toBe("string");
    expect(result.printedAt).toBe("2026-09-21 09:12");
    expect(JSON.stringify(result)).not.toMatch(/\d{6}-?\d{7}/);
    expect(decrypt).not.toHaveBeenCalled();
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
  });

  it("현장 확인증은 address가 null이다", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const result = await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, { signatureStore: storeWith(null) });
    expect(result.kind === "ok" && result.print.address).toBeNull();
  });

  it("저장소에 서명 객체가 없으면 DTO의 서명이 null이다(오류 표시는 화면 몫)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const result = await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, { signatureStore: storeWith(null) });
    expect(result.kind === "ok" && result.print.signatureDataUrl).toBeNull();
  });

  it("저장소 읽기가 던져도 서명이 null이다", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const broken: SignatureStore = {
      put: () => Promise.resolve(),
      get: () => Promise.reject(new Error("저장소 실패")),
      delete: () => Promise.resolve(),
    };
    const result = await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, { signatureStore: broken });
    expect(result.kind === "ok" && result.print.signatureDataUrl).toBeNull();
  });
});

describe("getCertificatePrint — notFound 다섯", () => {
  const deps = { signatureStore: storeWith(signaturePngFixture()) };

  it("certs.submissions 보기가 없는 기획 PM → notFound", async () => {
    const seeded = await seedSubmittedCert();
    const pm = await makeReviewer({ view: false, write: false, value: true, unmasked: false });
    expect(await getCertificatePrint(pm, seeded.submissionId, { ip: null }, deps)).toEqual({ kind: "notFound" });
  });

  it("파기됨(purged_at) → notFound", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    await db.update(certSubmissions).set({ purgedAt: new Date() }).where(eq(certSubmissions.id, seeded.submissionId));
    expect(await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, deps)).toEqual({ kind: "notFound" });
  });

  it("없는 id · uuid 아닌 id → notFound", async () => {
    const viewer = await makeReviewer(FULL_GRANT);
    expect(await getCertificatePrint(viewer, randomUUID(), { ip: null }, deps)).toEqual({ kind: "notFound" });
    expect(await getCertificatePrint(viewer, "not-a-uuid", { ip: null }, deps)).toEqual({ kind: "notFound" });
  });

  it("게이트 꺼짐 → notFound · 복호화 0번", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);
    expect(await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, deps)).toEqual({ kind: "notFound" });
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("대표 계급(role-ceo)에 certs.submissions 보기 · 정보 항목을 켜도 → notFound(codex #5)", async () => {
    const seeded = await seedSubmittedCert();
    await grantCertReview("role-ceo", FULL_GRANT);
    const ceo = await makeUser("role-ceo", "대표");
    expect(await getCertificatePrint(ceo, seeded.submissionId, { ip: null }, deps)).toEqual({ kind: "notFound" });
  });
});

describe("getCertificatePrint — 정보 항목 cert_submission.value 투영(codex r2 C3)", () => {
  it("보기는 켜고 cert_submission.value는 끈 viewer → notFound · 같은 원본의 투영은 {}(켜면 스펙의 모든 키)", async () => {
    const seeded = await seedSubmittedCert();
    const off = await makeReviewer({ view: true, write: false, value: false, unmasked: false });
    expect(
      await getCertificatePrint(off, seeded.submissionId, { ip: null }, { signatureStore: storeWith(signaturePngFixture()) }),
    ).toEqual({ kind: "notFound" });

    const sample: CertificatePrintRow = {
      certNo: seeded.certNo,
      eventName: seeded.eventName,
      wonOn: "2026-01-01",
      prizeName: "갤럭시 탭 S10",
      quantity: 1,
      name: "김하늘",
      rrnMasked: "930412-2******",
      phone: "010-4821-7730",
      address: null,
      submittedAt: "2026-09-20T09:42:00.000Z",
      signatureDataUrl: null,
    };
    expect(await project(off, sample, CERTIFICATE_PRINT_DTO_SPEC)).toEqual({});
    const allowed = await makeReviewer(FULL_GRANT);
    const projected = await project(allowed, sample, CERTIFICATE_PRINT_DTO_SPEC);
    expect(Object.keys(projected).sort()).toEqual(CERTIFICATE_PRINT_DTO_SPEC.fields.map((f) => f.key).sort());
  });
});

// 04.3-17 E36 — I4에서 수량을 고치면 인쇄 DTO의 경품 줄 수량이 따라간다.
describe("getCertificatePrint — 수량 정정 뒤(04.3-17 E36)", () => {
  it("수량을 3으로 정정한 뒤 인쇄 DTO quantity가 3", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const saved = await correctSubmission(viewer, seeded.submissionId, { version: 1, name: seeded.name, phone: seeded.phone, quantity: 3 });
    expect(saved.kind).toBe("saved");
    const print = await getCertificatePrint(viewer, seeded.submissionId, { ip: null }, { signatureStore: storeWith(signaturePngFixture()) });
    expect(print.kind === "ok" && print.print.quantity).toBe(3);
  });
});
