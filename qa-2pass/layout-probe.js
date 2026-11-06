// qa-2pass 1차 축 ⑤ 표시 깨짐 측정기.
// 사용: playwright-cli eval "$(cat ~/.claude/skills/qa-2pass/layout-probe.js)"
// 화면을 바꾸지 않는다(읽기만). 결과는 「후보」다 — 스크린샷으로 눈 확인 뒤 기록한다.
async () => {
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const MAX_PER_KIND = 15;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out = { viewport: `${vw}x${vh}`, lang: document.documentElement.lang || '', found: {} };
  const push = (kind, item) => {
    out.found[kind] = out.found[kind] || [];
    if (out.found[kind].length < MAX_PER_KIND) out.found[kind].push(item);
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    // sr-only 류(1px 클립) 제외
    if (cs.position === 'absolute' && r.width <= 1 && r.height <= 1) return false;
    return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };
  const desc = (el) => {
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 3).join('.') : '';
    const r = el.getBoundingClientRect();
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} 「${t.slice(0, 40)}」 @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  };
  const scrollable = (cs) => /(auto|scroll)/.test(cs.overflowX + cs.overflowY);
  const clips = (cs) => /(hidden|clip)/.test(cs.overflowX + cs.overflowY);
  const hasFullTextHint = (el, text) => {
    for (let n = el, i = 0; n && i < 3; n = n.parentElement, i++) {
      const hint = n.getAttribute && (n.getAttribute('title') || n.getAttribute('aria-label') || n.getAttribute('data-tooltip'));
      if (hint && hint.replace(/\s+/g, ' ').trim().length >= text.length) return true;
    }
    return false;
  };

  // 열린 대화상자가 있으면 그 안만 본다(뒤 화면은 가려진 게 정상)
  const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(visible);
  const root = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  const all = [...root.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'SVG', 'PATH', 'svg', 'path', 'NOSCRIPT'].includes(el.tagName) && visible(el));
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();

  // 1) 페이지 가로 넘침
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) push('페이지_가로넘침', `문서 폭 ${sw} > 창 ${vw}`);

  // 2) 말없이 잘림 — 넘치는데 스크롤도 전체 문구 힌트도 없다
  for (const el of all) {
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text || el.children.length > 3) continue;
    const cs = getComputedStyle(el);
    if (scrollable(cs)) continue;
    const overX = el.scrollWidth > el.clientWidth + 1 && (clips(cs) || cs.textOverflow === 'ellipsis');
    const overY = el.scrollHeight > el.clientHeight + 2 && clips(cs) && !cs.webkitLineClamp?.match?.(/\d/);
    if ((overX || overY) && !hasFullTextHint(el, text)) {
      push(overX ? '가로_잘림' : '세로_잘림', `${desc(el)} scroll ${el.scrollWidth}x${el.scrollHeight} / box ${el.clientWidth}x${el.clientHeight}${cs.textOverflow === 'ellipsis' ? ' (말줄임·전체문구 힌트 없음)' : ''}`);
    }
  }

  // 3) 단어 중간 줄바꿈 — 공백 없는 짧은 덩어리가 두 줄 이상(「프로젝트 기 / 반」, 「경/영/전/략」)
  //    본문 문단은 한글이 음절 단위로 줄바꿈되는 게 정상이라 제외 — 라벨·버튼·이름 같은 짧은 글자만 본다
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || !visible(parent)) continue;
    if (n.textContent.trim().length > 24) continue;
    if (parent.closest('p,article,[contenteditable],.ProseMirror,.post-content,.dr-html,iframe')) continue;
    for (const word of n.textContent.split(/\s+/).filter((w) => w.length >= 2 && w.length <= 20)) {
      const idx = n.textContent.indexOf(word);
      const range = document.createRange();
      range.setStart(n, idx);
      range.setEnd(n, idx + word.length);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) {
        push('단어중간_줄바꿈', `「${word}」 ${tops.size}줄 — ${desc(parent)}`);
        break;
      }
    }
  }

  // 4) 가려진 조작 요소 — 가운데 점을 누르면 다른 요소가 받는다(하단 바·토스트·겹친 칸)
  const interactive = all.filter((el) => el.matches('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=checkbox],[role=combobox]'));
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      push('가려진_조작요소', `${desc(el)} ← 덮은 것: ${desc(hit)}`);
    }
  }

  // 5) 부모 밖으로 밀려 안 보임 — 잘라내는(스크롤 없는) 조상 밖에 걸친 요소(「+N개」, 마지막 탭)
  for (const el of all) {
    if (!ownText(el) && !el.matches('button,[role=tab],input')) continue;
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (scrollable(cs)) break;
      if (!clips(cs)) continue;
      const pr = p.getBoundingClientRect();
      if (r.right > pr.right + 2 || r.bottom > pr.bottom + 2 || r.left < pr.left - 2) push('부모밖_잘림', `${desc(el)} ⊄ ${desc(p)}`);
      break;
    }
    if (r.right > vw + 1 && !el.closest('[style*=overflow],.overflow-x-auto,.overflow-auto')) push('창밖_밀림', desc(el));
  }

  // 6) 글자끼리 겹침 — 서로 조상 관계가 아닌 글자 덩어리의 사각형이 겹친다(「예약됨」×「받은 메일함」, 시·분 겹침)
  const leaves = all.filter((el) => ownText(el) && el.children.length === 0).slice(0, 700);
  const rects = leaves.map((el) => el.getBoundingClientRect());
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 3 && h > 3 && !leaves[i].contains(leaves[j]) && !leaves[j].contains(leaves[i])) {
        push('글자_겹침', `${desc(leaves[i])} ∩ ${desc(leaves[j])} (${Math.round(w)}x${Math.round(h)})`);
      }
    }
  }

  // 7) 같은 표시가 나란히 두 번 — 칩·배지 중복(「반려」「반려」, 「승인 완료」「승인」)
  for (const el of all) {
    const kids = [...el.children].filter(visible);
    for (let i = 1; i < kids.length; i++) {
      const a = (kids[i - 1].innerText || '').trim();
      const b = (kids[i].innerText || '').trim();
      if (a && b && a.length <= 10 && !/^[\d\s.,:/()%-]+$/.test(a) && (a === b || a.startsWith(b) || b.startsWith(a)) && kids[i].getBoundingClientRect().width < 200) {
        push('중복_표시', `「${a}」「${b}」 — ${desc(el)}`);
      }
    }
  }

  // 8) 모바일 폭이면 손가락으로 누르기 작은 조작 요소(32px 미만)
  if (vw <= 480) {
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (r.width < 32 && r.height < 32) push('작은_누름영역', desc(el));
    }
  }

  out.counts = Object.fromEntries(Object.entries(out.found).map(([k, v]) => [k, v.length]));
  return JSON.stringify(out, null, 1);
}
