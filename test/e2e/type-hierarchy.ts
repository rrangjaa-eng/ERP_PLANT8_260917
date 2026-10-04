import type { Page } from "@playwright/test";

// 글자 위계 수집·판정 도우미(04.6-29 · SC 7). 테스트를 등록하지 않는다 — type-hierarchy.spec.ts(데스크톱)와 cert-design-gates.spec.ts(certs 프로젝트)가 함께 쓴다
// (스펙 파일끼리 import하지 않는다 — 테스트가 두 번 등록된다).
// 계약(UI-SPEC 「Typography」): 보이는 글자의 계산된 `font-size`는 역할 토큰 값 {제목, 부제, 본문, 보조, 태그, KPI}(외부 수령자 화면 `/c/<token>`은 + 산문) 중 하나,
// 제목 크기는 `[data-ui="screen-title"]`에만, `font-weight`는 `--fw-*` 값뿐이다. 허용 값은 `document.documentElement`의 계산 값에서 읽는다(리터럴 px 없음 — 폰 본문 15도 따라온다).

export type TypeViolation = { rule: "글자 크기 토큰 밖" | "굵기 토큰 밖" | "제목 크기는 틀만"; detail: string };

type TypeItem = { size: string; weight: string; where: string; text: string; inScreenTitle: boolean };
export type TypeSnapshot = { sizes: Record<string, string>; weights: Record<string, string>; items: TypeItem[] };

const SIZE_TOKENS = ["title", "subtitle", "body", "aux", "tag", "kpi"] as const;
const WEIGHT_TOKENS = ["regular", "medium", "bold", "mark"] as const;

// 브라우저 안에서 도는 수집 함수 — 직렬화되므로 바깥 변수를 쓰지 않는다.
function collectTypeSnapshot(args: { sizeTokens: string[]; weightTokens: string[] }): TypeSnapshot {
  const probe = document.createElement("span");
  document.body.append(probe);
  const sizes: Record<string, string> = {};
  for (const name of args.sizeTokens) {
    probe.style.fontSize = `var(--text-${name})`;
    sizes[name] = getComputedStyle(probe).fontSize;
  }
  const weights: Record<string, string> = {};
  for (const name of args.weightTokens) {
    probe.style.fontWeight = `var(--fw-${name})`;
    weights[name] = getComputedStyle(probe).fontWeight;
  }
  probe.remove();

  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "OPTION", "OPTGROUP", "TITLE", "HEAD"]);
  const visible = (el: Element): boolean => {
    if (skipTags.has(el.tagName) || el.closest("[hidden]")) return false;
    const rects = el.getClientRects();
    if (rects.length === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") return false;
    // sr-only(1px 상자 · 잘림)는 눈에 보이는 글자가 아니다.
    const box = rects[0];
    return box !== undefined && !(box.width <= 1 && box.height <= 1);
  };
  const describe = (el: Element): string => {
    const hook = el.getAttribute("data-ui");
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : "";
    return `${el.tagName.toLowerCase()}${hook ? `[data-ui=${hook}]` : cls}`;
  };
  const seen = new Set<string>();
  const items: TypeItem[] = [];
  const add = (el: Element, text: string) => {
    const cs = getComputedStyle(el);
    const inScreenTitle = el.closest('[data-ui="screen-title"]') !== null;
    const key = `${cs.fontSize}|${cs.fontWeight}|${describe(el)}|${inScreenTitle}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ size: cs.fontSize, weight: cs.fontWeight, where: describe(el), text: text.slice(0, 24), inScreenTitle });
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    const parent = node.parentElement;
    if (!text || !parent || !visible(parent)) continue;
    add(parent, text);
  }
  // 입력 칸의 글자는 텍스트 노드가 아니라 요소 자체의 크기다.
  for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
    const type = el.getAttribute("type");
    if (type === "hidden" || type === "checkbox" || type === "radio" || !visible(el)) continue;
    add(el, el.getAttribute("placeholder") ?? el.tagName.toLowerCase());
  }
  return { sizes, weights, items };
}

// 순수 판정 — 스냅숏 하나에서 위반 목록을 낸다.
export function evaluateTypeHierarchy(snapshot: TypeSnapshot, opts: { external: boolean } = { external: false }): TypeViolation[] {
  const allowedSizes = new Set(Object.values(snapshot.sizes));
  const allowedWeights = new Set(Object.values(snapshot.weights));
  const violations: TypeViolation[] = [];
  for (const item of snapshot.items) {
    const label = `${item.where} 「${item.text}」`;
    if (!allowedSizes.has(item.size)) violations.push({ rule: "글자 크기 토큰 밖", detail: `${item.size} ${label}` });
    if (!allowedWeights.has(item.weight)) violations.push({ rule: "굵기 토큰 밖", detail: `${item.weight} ${label}` });
    // 외부 수령자 화면(`app/c/**`)은 셸 없는 자체 틀이라 제목 크기를 자기 `h1`에 쓴다(SYSTEM §6-5 · 공통 §3 경로 예외).
    if (!opts.external && item.size === snapshot.sizes.title && !item.inScreenTitle) violations.push({ rule: "제목 크기는 틀만", detail: `${item.size} ${label}` });
  }
  return violations;
}

/** 현재 화면의 글자 위계 위반. `external` = 외부 수령자 화면 `/c/<token>`(산문 크기를 본문 자리에 허용 — 공통 §4 Q7 · 자체 틀이라 제목 크기를 틀 밖 `h1`에도 허용). */
export async function measureTypeHierarchy(page: Page, opts: { external: boolean }): Promise<{ violations: TypeViolation[]; textRuns: number }> {
  const sizeTokens = [...SIZE_TOKENS, ...(opts.external ? (["prose"] as const) : [])];
  const snapshot = await page.evaluate(collectTypeSnapshot, { sizeTokens: [...sizeTokens], weightTokens: [...WEIGHT_TOKENS] });
  return { violations: evaluateTypeHierarchy(snapshot, opts), textRuns: snapshot.items.length };
}
