// qa-2pass 재시험 — 저장 · 전송 요청을 실제로 보내지 않고 본문만 기록한다.
// 켜기:  playwright-cli eval "$(cat ~/.claude/skills/qa-2pass/scripts/save-guard.js)"
// 읽기:  playwright-cli eval "() => JSON.stringify(window.__qaSent, null, 1)"
// 끄기:  새로고침(reload). 끄지 않고 다른 조작을 이어 가지 않는다.
//
// ⚠ 저장 버튼을 누르기 **직전에만** 켠다. 서버 액션 같은 구조는 조회도 POST 라서, 미리 켜 두면
//   목록 · 선택 창 조회까지 막혀 화면이 빈다. 막힌 응답(418)에 화면이 오류 안내를 띄우는 것은 정상이다.
() => {
  if (window.__qaGuardOn) return 'already armed';
  window.__qaSent = [];
  const realFetch = window.fetch.bind(window);
  const bodyText = (body) => {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      return JSON.stringify([...body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `<file ${v.name} ${v.size}B>`]));
    }
    return `<${Object.prototype.toString.call(body)}>`;
  };
  window.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input);
    const method = (init.method || (req && req.method) || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') return realFetch(input, init);
    let body = bodyText(init.body);
    if (!body && req) {
      try { body = await req.clone().text(); } catch { body = '<unreadable>'; }
    }
    const headers = {};
    new Headers(init.headers || (req && req.headers) || {}).forEach((v, k) => {
      if (/^(content-type|next-action|x-requested-with)$/i.test(k)) headers[k] = v;
    });
    window.__qaSent.push({ at: new Date().toISOString(), method, url, headers, body: body.slice(0, 8000) });
    return new Response(JSON.stringify({ blockedByQaGuard: true }), {
      status: 418,
      headers: { 'content-type': 'application/json' },
    });
  };
  const realSend = XMLHttpRequest.prototype.send;
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__qa = { method: String(method).toUpperCase(), url: String(url) };
    return realOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const m = this.__qa && this.__qa.method;
    if (!m || m === 'GET' || m === 'HEAD') return realSend.call(this, body);
    window.__qaSent.push({ at: new Date().toISOString(), method: m, url: this.__qa.url, headers: {}, body: bodyText(body).slice(0, 8000) });
    this.abort();
  };
  window.__qaGuardOn = true;
  return 'armed';
}
