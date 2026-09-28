// check.mjs — 스킨 보드 목업 실측 검사 (앱 테스트가 아니다).
// 실행: node docs/design/explore-skin/check.mjs   (저장소 루트에서)
// 네 스킨 × 세 화면 × 폭 3개(1280 · 390 · 320)에서
//   ① 문서 가로 넘침 없음 (scrollWidth ≤ clientWidth)
//   ② 보이는 모든 글자 요소의 대비 ≥ 4.5 (실제 배경을 조상까지 거슬러 합성)
//   ②' 숨김 면 안에서 내용이 잘리지 않음
//   ③ 스킨 CSS가 실제로 적용됨 (body 배경이 스킨마다 기대값)
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
// 스킨 4개 + 각 스킨에 §5 밖 완화 후보 9개를 모두 켠 조합(#a-all) + 후보 하나씩(원장 위, 우선순위 1~5)
const skins = ['ledger', 'a', 'b', 'c', 'ledger-all', 'a-all', 'b-all', 'c-all', 'ledger-r1', 'ledger-r2', 'ledger-r3', 'ledger-r4', 'ledger-r5'];
const screens = ['projects.html', 'project.html', 'vendors.html'];
const widths = [1280, 390, 320];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const fails = [];
let checked = 0;
const canvasBySkin = {};

for (const skin of skins) {
  for (const screen of screens) {
    for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      const url = `file://${dir}/${screen}#${skin}`;
      const res = await page.goto(url).catch((e) => e);
      if (res instanceof Error) { fails.push(`${skin} ${screen} ${w}: 열 수 없음 (${res.message.split('\n')[0]})`); await page.close(); continue; }
      await page.waitForFunction(() => document.documentElement.dataset.skinReady === '1', null, { timeout: 3000 })
        .catch(() => fails.push(`${skin} ${screen} ${w}: 스킨 로드 신호 없음`));
      await page.waitForTimeout(400); // 늦게 붙은 스킨 CSS가 hover 전환(120ms)을 한 번 돌린다 — 끝난 뒤 잰다
      const r = await page.evaluate(() => {
        const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return { r, g, b, a }; };
        const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
        const bgOf = (el) => {
          const stack = [];
          for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a === 1) break; }
          let acc = { r: 255, g: 255, b: 255, a: 1 };
          for (const c of stack.reverse()) acc = over(c, acc);
          return acc;
        };
        const bad = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        while (walker.nextNode()) {
          const t = walker.currentNode; const el = t.parentElement;
          if (!t.textContent.trim() || seen.has(el)) continue; seen.add(el);
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || el.getClientRects().length === 0 || el.closest('[aria-hidden="true"]')) continue;
          if (el.closest('kbd')) continue; // 단축키 표기는 장식 보조(SYSTEM §7-9, --faint 기준과 같다)
          const fg = parse(cs.color); const bg = bgOf(el);
          const L1 = lum(over(fg, bg)), L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (ratio < 4.5) bad.push(`${el.tagName.toLowerCase()}.${el.className || '-'} "${t.textContent.trim().slice(0, 16)}" ${ratio.toFixed(2)}`);
        }
        // 잘림: overflow가 숨김인 면 안에서 내용이 넘치면 가로 넘침 검사에 안 잡히고 조용히 잘린다
        for (const e of document.querySelectorAll('body *')) {
          if (e.matches('.sr, .sr *') || !e.getClientRects().length) continue;
          const ox = getComputedStyle(e).overflowX;
          if ((ox === 'hidden' || ox === 'clip') && e.scrollWidth > e.clientWidth + 1) bad.push(`잘림 ${e.tagName.toLowerCase()}.${e.className} ${e.scrollWidth}>${e.clientWidth}`);
        }
        // 후보 신호: #…-rN이면 html에 rN 클래스가 붙어야 한다
        const want = (location.hash.includes('-all') ? [1,2,3,4,5,6,7,8,9].map((n) => 'r' + n) : (location.hash.match(/r\d/g) || []));
        for (const c of want) if (!document.documentElement.classList.contains(c)) bad.push(`잘림 후보 클래스 없음 ${c}`);
        // 후보 4(아이콘)가 켜지면 하단 탭·검색에 16/20px 아이콘이 실제로 보여야 한다
        if (want.includes('r4')) {
          const ics = [...document.querySelectorAll('svg.ic')].filter((e) => e.getClientRects().length);
          if (!ics.length) bad.push('잘림 후보4 아이콘이 하나도 안 보임');
          for (const e of ics) { const w = Math.round(e.getBoundingClientRect().width); if (w !== 16 && w !== 20) bad.push(`잘림 아이콘 크기 ${w}px`); }
        }
        const se = document.scrollingElement;
        return { sw: se.scrollWidth, cw: se.clientWidth, bad, canvas: getComputedStyle(document.body).backgroundColor };
      });
      checked++;
      if (r.sw > r.cw) fails.push(`${skin} ${screen} ${w}: 가로 넘침 ${r.sw} > ${r.cw}`);
      for (const b of r.bad) fails.push(`${skin} ${screen} ${w}: ${b.startsWith('잘림') ? '' : '대비 미달 '}${b}`);
      (canvasBySkin[skin] ??= new Set()).add(r.canvas);
      await page.close();
    }
  }
}
await browser.close();

// ③ 스킨끼리 바탕이 달라야 스킨이 실제로 갈렸다고 본다 (원장 = 흰색)
const canv = Object.fromEntries(Object.entries(canvasBySkin).map(([k, v]) => [k, [...v].join('|')]));
if (new Set(['ledger','a','b','c'].map((k) => canv[k])).size < 3) fails.push(`스킨 바탕이 서로 갈리지 않음: ${JSON.stringify(canv)}`);

const uniq = [...new Set(fails)];
console.log(`검사 ${checked}건 · 실패 ${uniq.length}건`);
for (const f of uniq.slice(0, 60)) console.log(' ✗ ' + f);
process.exit(uniq.length ? 1 : 0);
