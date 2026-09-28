// skin.mjs — 주소 끝 해시로 스킨과 완화 후보를 고른다. 스킨·후보는 CSS만 바꾸고 DOM은 같다.
//   #ledger · #a · #b · #c            스킨
//   #a-r1-r4                          스킨 + §5 밖 완화 후보(1~9) 일부
//   #a-all                            스킨 + 후보 9개 전부
//   …-m                               사용자 메뉴를 열어 둔 채로(떠 있는 요소 비교용)
(function () {
  var parts = (location.hash.slice(1) || 'ledger').split('-');
  var s = parts[0] || 'ledger';
  var d = document.documentElement;
  d.dataset.skin = s;
  parts.slice(1).forEach(function (p) {
    if (p === 'all') for (var n = 1; n <= 9; n++) d.classList.add('r' + n);
    else if (/^r[1-9]$/.test(p)) d.classList.add(p);
    else if (p === 'm') d.classList.add('menu-open');
  });
  addEventListener('hashchange', function () { location.reload(); });

  // 아이콘 한 세트(Lucide 모양, 24 격자) — 후보 4가 켜질 때만 보인다
  var I = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    check: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>'
  };
  document.addEventListener('DOMContentLoaded', function () {
    var sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">';
    for (var k in I) sprite += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + I[k] + '</symbol>';
    document.body.insertAdjacentHTML('afterbegin', sprite + '</svg>');
    // 사용자 메뉴: 누르면 열고 Esc·바깥 누름으로 닫는다
    var btn = document.querySelector('.who'), menu = document.querySelector('.umenu');
    if (!btn || !menu) return;
    function set(open) { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    set(d.classList.contains('menu-open'));
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(menu.hidden); });
    document.addEventListener('click', function () { set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
  });

  function ready() { d.dataset.skinReady = '1'; }
  if (s === 'ledger') { ready(); return; }
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'skin-' + s + '.css';
  l.onload = l.onerror = ready;
  document.head.appendChild(l);
})();
