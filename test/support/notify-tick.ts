import { createSign, generateKeyPairSync } from "node:crypto";
import type { Certificates } from "google-auth-library";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";

// 테스트 전용 — 프로덕션 폴더(app·domain·lib·repositories)는 이 파일을
// import하지 않는다. 테스트 조건 종류는 `runTick({ conditionKinds })`로만 주입된다
// (UI-SPEC 카피 계약: 「테스트 알림 · {대상 id}」가 프로덕션 알림함에 나오면 결함).

export function testCandidate(input: {
  recipientId: string;
  entityId: string;
  referenceDate: string;
  round?: number;
}): NotificationCandidate {
  return {
    entity: "test",
    entityId: input.entityId,
    recipientId: input.recipientId,
    round: input.round ?? 1,
    referenceDate: input.referenceDate,
    message: `테스트 알림 · ${input.entityId}`,
  };
}

type CandidateSource =
  | readonly NotificationCandidate[]
  | (() => readonly NotificationCandidate[] | Promise<readonly NotificationCandidate[]>);

export type TestConditionKind = ConditionKind & { evaluations: () => number };

// 발생 계약: evaluate({ today })는 referenceDate <= today인 발생을 전부 돌려준다
// (원장에 이미 있는 발생은 tick이 키로 건너뛴다). source가 함수면 평가마다 불려
// 던지기·대기 같은 동작을 테스트가 끼울 수 있다.
export function createTestConditionKind(
  source: CandidateSource,
  opts?: { kind?: string },
): TestConditionKind {
  let count = 0;
  return {
    kind: opts?.kind ?? "test",
    label: "테스트 알림",
    dateUnit: "calendar",
    evaluations: () => count,
    async evaluate({ today }) {
      count += 1;
      const all = typeof source === "function" ? await source() : source;
      return all.filter((candidate) => candidate.referenceDate <= today);
    },
  };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export type TestTokenClaims = {
  iss?: string;
  aud?: string;
  email?: string;
  // 문자열 "true"는 거부 케이스(04.2-05 — `=== true`만 통과)를 만들기 위해 허용한다.
  email_verified?: boolean | string;
  iat?: number;
  exp?: number;
};

// RS256 테스트 토큰 서명기 — 실제 Google 인증서 대신 이 키 한 쌍의 공개키를
// getCerts로 돌려준다(kid "test-kid").
export function createTestSigner(): {
  sign: (claims: TestTokenClaims & { aud: string }) => string;
  getCerts: () => Promise<Certificates>;
} {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();

  function sign(claims: TestTokenClaims & { aud: string }): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", kid: "test-kid", typ: "JWT" };
    const payload = {
      iss: "https://accounts.google.com",
      email_verified: true,
      iat: now,
      exp: now + 300,
      ...claims,
    };
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${base64url(signer.sign(privateKey))}`;
  }

  return {
    sign,
    getCerts: () => Promise.resolve({ "test-kid": publicPem }),
  };
}
