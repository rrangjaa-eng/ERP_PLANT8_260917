import type { Page, Response, Route } from "@playwright/test";

// 04.3-15 Task 1 ① — 수령자 쪽 가액 누수 검사 공용 도우미(04.3-16 · 04.3-10이 import한다).
// 규약 C4 — @playwright/test는 `import type`만: 통합 테스트가 순수 함수(leakPatternsFor · scanForLeaks ·
// scannerSelfTest)를 불러도 러너 패키지를 싣지 않는다.
//
// 경계 규칙(04.3-05 교훈 — 무작위 16진 해시 안에 숫자열이 우연히 들어 있는 간헐 실패): 가액 숫자는 앞뒤가
// 숫자 · 영문자가 아닐 때만 건다. 해시 · uuid · 암호문 안의 숫자열은 앞뒤가 16진 글자라 걸리지 않는다.

export type LeakPattern = { label: string; regex: RegExp };

// 가액 필드 이름(영문 둘의 두 표기 + 한글). 경품명 안의 금액은 잡지 못한다 — 운영 규칙(D-c ②)이 막는다.
const FIELD_NAME_PATTERNS: readonly string[] = ["unitValue", "unit_value", "prizeValue", "prize_value", "가액"];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withComma(value: number): string {
  return value.toLocaleString("en-US");
}

function bounded(text: string): RegExp {
  return new RegExp(`(?<![0-9A-Za-z])${escapeRegExp(text)}(?![0-9A-Za-z])`, "g");
}

/** 가액 숫자(쉼표 없음 · 쉼표 있음)와 가액 필드 이름의 패턴. */
export function leakPatternsFor(values: readonly number[]): LeakPattern[] {
  const patterns: LeakPattern[] = [];
  for (const value of values) {
    const plain = String(value);
    patterns.push({ label: plain, regex: bounded(plain) });
    const comma = withComma(value);
    if (comma !== plain) patterns.push({ label: comma, regex: bounded(comma) });
  }
  for (const name of FIELD_NAME_PATTERNS) patterns.push({ label: name, regex: new RegExp(escapeRegExp(name), "g") });
  return patterns;
}

/** 말뭉치에서 걸린 패턴 — `{label} … 앞뒤 20자` 줄. 빈 배열이면 누수 없음. */
export function scanForLeaks(corpus: string, patterns: readonly LeakPattern[]): string[] {
  const hits: string[] = [];
  for (const pattern of patterns) {
    for (const match of corpus.matchAll(new RegExp(pattern.regex.source, "g"))) {
      const at = match.index ?? 0;
      hits.push(`${pattern.label} … ${corpus.slice(Math.max(0, at - 20), at + match[0].length + 20)}`);
    }
  }
  return hits;
}

/** 검출기 자체 시험 — 합성 문자열에서는 걸리고, 16진 해시 안의 같은 숫자열에서는 걸리지 않아야 참. */
export function scannerSelfTest(): boolean {
  const patterns = leakPatternsFor([73_519]);
  const mustHit = ['{"x":73519}', "73,519원", '{"unitValueKrw":1}', "1개 가액"];
  const mustMiss = ["ab73519cd", "f73519e", "x73,519y", "173519", "735190"];
  return (
    mustHit.every((text) => scanForLeaks(text, patterns).length > 0) &&
    mustMiss.every((text) => scanForLeaks(text, patterns).length === 0)
  );
}

const SCANNED_TYPES = ["text/html", "text/x-component", "application/json"];
const STATIC_ASSET_PATH = /\/_next\/static\/[^"' )]+/g;

export type CertResponseCorpus = {
  corpus: string;
  documentCount: number;
  actionPostCount: number;
  // 서버 액션 POST 응답 본문(서버가 실제로 돌려준 값 — 갈래 응답 단언용).
  actionBodies: string[];
  urls: string[];
};

/**
 * 같은 출처 응답 가운데 HTML · RSC · JSON 본문을 모은다. 서버 액션 POST(`next-action` 머리)는 `route.fetch()`로 페이지보다
 * 먼저 본문을 읽는다 — 결과를 받은 화면이 곧바로 `history.replaceState`(같은 문서 이동)를 하면 그 뒤에는 Playwright가
 * 응답 본문을 내주지 않는다. 문서 등 나머지는 `page.on("response")`로 모은다. `finish()`가 모든 본문을 기다린 뒤 마지막
 * 문서의 `outerHTML`을 더하고 정적 자원 경로를 지워 말뭉치를 돌려준다. 대상인데 본문을 못 읽으면 그 URL과 함께 던진다
 * (빈 수집으로 통과하지 않게). 부르는 쪽은 이 함수를 기다린 뒤 page.goto로 수령자 페이지를 연다. 같은 POST를 고쳐 보내는
 * 스펙은 `route.fallback({ postData })`로 넘긴다(이 도우미의 경로 처리기가 고친 본문으로 보낸다).
 */
export async function collectCertResponses(page: Page): Promise<{ finish: () => Promise<CertResponseCorpus> }> {
  // 출처는 첫 문서 응답(부르는 쪽이 이 함수 뒤에 page.goto로 연 수령자 페이지)에서 정한다.
  let origin: string | null = null;
  const bodies: { url: string; text: Promise<string>; action: boolean }[] = [];
  const failures: string[] = [];
  let documentCount = 0;
  let actionPostCount = 0;

  function isScanned(type: string): boolean {
    return SCANNED_TYPES.some((t) => type.toLowerCase().includes(t));
  }

  function remember(url: string, text: Promise<string>, action = false): void {
    bodies.push({
      url,
      action,
      text: text.catch((error: unknown) => {
        failures.push(`${url} — ${error instanceof Error ? error.message : String(error)}`);
        return "";
      }),
    });
  }

  async function onRoute(route: Route): Promise<void> {
    const request = route.request();
    const sameOrigin = origin !== null && new URL(request.url()).origin === origin;
    if (!sameOrigin || request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    if (isScanned(response.headers()["content-type"] ?? "")) {
      actionPostCount++;
      remember(request.url(), response.text(), true);
    }
    await route.fulfill({ response });
  }

  function onResponse(response: Response): void {
    const url = response.url();
    const request = response.request();
    const isDocument = request.resourceType() === "document";
    if (origin === null && isDocument) origin = new URL(url).origin;
    if (origin === null || new URL(url).origin !== origin) return;
    if (request.method() === "POST" && request.headers()["next-action"]) return; // onRoute가 모은다
    if (!isScanned(response.headers()["content-type"] ?? "")) return;
    if (isDocument) documentCount++;
    remember(url, response.text());
  }

  page.on("response", onResponse);
  await page.route("**/*", onRoute);

  return {
    finish: async () => {
      page.off("response", onResponse);
      await page.unroute("**/*", onRoute);
      const texts = await Promise.all(bodies.map((b) => b.text));
      if (failures.length > 0) throw new Error(`응답 본문을 읽지 못했다: ${failures.join(" | ")}`);
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      const corpus = [...texts, html].join("\n").replace(STATIC_ASSET_PATH, "");
      const actionBodies = texts.filter((_, i) => bodies[i]?.action);
      return { corpus, documentCount, actionPostCount, actionBodies, urls: bodies.map((b) => b.url) };
    },
  };
}
