// 얘들아 이제는 진짜 정해야해 — 화면과 라우팅
(function () {
  const B = window.EB.backend;
  const D = window.EBDate;
  const app = document.getElementById('app');
  const LABEL = { ok: '가능', maybe: '애매', no: '불가' };
  const GLYPH = { ok: '○', maybe: '△', no: '✕' };
  const RANK = { ok: 0, maybe: 1, no: 2 };
  const LEN_LABEL = ['하루', '1박 2일', '2박 3일', '3박 4일'];

  let me = null;
  let cleanups = [];
  const addCleanup = fn => cleanups.push(fn);
  let navToken = 0;     // 화면이 바뀌면 증가 — 늦게 도착한 비동기 결과를 버리기 위함
  let localAuth = 0;    // 이 화면에서 직접 로그인/로그아웃 중이면 auth 이벤트로 다시 이동하지 않음
  async function withAuth(fn) { localAuth++; try { return await fn(); } finally { localAuth--; } }

  // ───────── helpers ─────────
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // 고정 문자열(아이콘)에만 사용
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    raw(k) { try { return localStorage.getItem(k); } catch { return null; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
  const shareUrl = code => `${location.origin}${location.pathname}#/e/${code}`;
  function setPage(...nodes) { app.replaceChildren(...nodes); window.scrollTo(0, 0); }
  function copyText(text, btn, fallbackEl) {
    const label = btn.textContent;
    const done = () => { btn.textContent = '복사됨 ✓'; setTimeout(() => { btn.textContent = label; }, 1600); };
    const fallback = () => { if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.value = text; fallbackEl.select(); } };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
  }
  const GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  function requireAuth() {
    if (me) return true;
    store.set(window.EB.RETURN_KEY, location.hash || '#/');
    go('#/login');
    return false;
  }
  function afterLogin() {
    let r = store.get(window.EB.RETURN_KEY, null);
    store.del(window.EB.RETURN_KEY);
    if (!r || /^#\/(login|signup|forgot)/.test(r)) r = '#/';
    // 재설정 화면은 메일 링크로 들어온 경우에만 (예전에 요청만 해 두고 남은 기록은 무시)
    if (r === '#/reset' && !(B.wasRecovery && B.wasRecovery())) r = '#/';
    go(r);
  }

  // ───────── nav ─────────
  function renderNav() {
    const nav = document.getElementById('nav');
    if (me) {
      nav.replaceChildren(
        h('span', { class: 'who', text: me.name + '님' }),
        h('a', { class: 'btn small ghost', href: '#/' }, '내 여행'),
        h('a', { class: 'btn small ghost', href: '#/account' }, '내 정보'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => { await withAuth(() => B.signOut()); me = null; store.del(window.EB.RETURN_KEY); renderNav(); go('#/'); } }, '로그아웃'));
    } else {
      nav.replaceChildren(
        h('a', { class: 'btn small ghost', href: '#/login' }, '로그인'),
        h('a', { class: 'btn small primary', href: '#/signup' }, '회원가입'));
    }
  }

  // ───────── landing ─────────
  function viewLanding() {
    const demoHost = h('div');
    setPage(
      h('section', { class: 'hero' },
        h('div', {},
          h('div', { class: 'eyebrow', text: '날짜 맞추기부터 여행 기록까지' }),
          h('h1', {}, '얘들아,', h('br'), '이제는 진짜 ', h('span', { class: 'q', text: '정해야해' })),
          h('p', { class: 'lead', text: '초대 링크 하나로 친구들을 모아 날짜를 정하고, 일정표·준비물·정산·다이어리까지 함께 써요.' }),
          h('div', { class: 'row' },
            h('a', { class: 'btn primary', href: me ? '#/new' : '#/signup' }, '무료로 여행 만들기'),
            h('a', { class: 'btn', href: me ? '#/' : '#/login' }, me ? '내 여행 보기' : '로그인'))),
        demoHost),
      h('ol', { class: 'steps' },
        h('li', {}, h('span', { class: 'n', text: 'STEP 1' }), h('b', { text: '여행 만들고 초대' }), h('span', { text: '날짜 투표, 날짜 확정, 날짜 미정 중에 고르고 초대 링크를 단톡방에 보내요.' })),
        h('li', {}, h('span', { class: 'n', text: 'STEP 2' }), h('b', { text: '되는 날 자동 추천' }), h('span', { text: '각자 안 되는 날만 표시하면 모두 되는 날을 찾아 주고, 방장이 확정해요.' })),
        h('li', {}, h('span', { class: 'n', text: 'STEP 3' }), h('b', { text: '함께 계획하고 기록' }), h('span', { text: '일차별 일정표와 지도, 준비물, 정산, 사진 다이어리를 멤버들과 같이 써요.' }))));
    if (window.EBLanding) addCleanup(window.EBLanding.mount(demoHost));
  }

  // ───────── auth screens ─────────
  function googleButton(label) {
    const err = h('p', { class: 'err-text', hidden: true });
    const btn = h('button', { class: 'btn big google', type: 'button', html: GOOGLE_SVG });
    btn.append(label);
    btn.onclick = async () => {
      btn.disabled = true; err.hidden = true;
      try {
        await withAuth(() => B.signInGoogle(store.get(window.EB.RETURN_KEY, '#/')));
        if (B.mode === 'demo') { me = B.currentUser(); renderNav(); afterLogin(); }
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
    };
    return [btn, err];
  }

  function viewLogin() {
    if (me) { afterLogin(); return; }
    const email = h('input', { type: 'email', id: 'login-email', autocomplete: 'email', required: true, placeholder: 'name@example.com' });
    const pw = h('input', { type: 'password', id: 'login-pw', autocomplete: 'current-password', required: true });
    const err = h('p', { class: 'err-text', hidden: true });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, '로그인');
    const form = h('form', { class: 'panel', novalidate: true },
      h('h1', { text: '로그인' }),
      h('p', { class: 'hint', text: '로그인하면 받은 링크의 일정에 바로 표시할 수 있어요.' }),
      ...googleButton('Google로 계속하기'),
      h('div', { class: 'divider', text: '또는 이메일로' }),
      h('label', { class: 'f' }, '이메일', email),
      h('label', { class: 'f' }, '비밀번호', pw),
      err, submit,
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('a', { href: '#/forgot', class: 'hint' }, '비밀번호를 잊으셨나요?'),
        h('a', { href: '#/signup', class: 'hint' }, '회원가입')));
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true;
      if (!email.value.trim() || !pw.value) { err.textContent = '이메일과 비밀번호를 입력해 주세요.'; err.hidden = false; return; }
      submit.disabled = true;
      try { me = await withAuth(() => B.signInEmail(email.value.trim(), pw.value)); renderNav(); afterLogin(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
      finally { submit.disabled = false; }
    });
    setPage(h('div', { class: 'auth' }, form));
    email.focus();
  }

  function viewSignup() {
    if (me) { afterLogin(); return; }
    const name = h('input', { type: 'text', id: 'su-name', autocomplete: 'name', maxlength: '30', placeholder: '모임에서 보일 이름' });
    const email = h('input', { type: 'email', id: 'su-email', autocomplete: 'email', placeholder: 'name@example.com' });
    const pw = h('input', { type: 'password', id: 'su-pw', autocomplete: 'new-password', placeholder: '영문+숫자 8자 이상' });
    const pw2 = h('input', { type: 'password', id: 'su-pw2', autocomplete: 'new-password' });
    const agree = h('input', { type: 'checkbox', id: 'su-agree' });
    const err = h('p', { class: 'err-text', hidden: true });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, '가입하기');
    const form = h('form', { class: 'panel', novalidate: true },
      h('h1', { text: '회원가입' }),
      ...googleButton('Google 계정으로 가입'),
      h('div', { class: 'divider', text: '또는 이메일로 가입' }),
      h('label', { class: 'f' }, '이름', name),
      h('label', { class: 'f' }, '이메일', email),
      h('label', { class: 'f' }, '비밀번호', pw),
      h('label', { class: 'f' }, '비밀번호 확인', pw2),
      h('label', { class: 'check', for: 'su-agree' }, agree,
        h('span', {}, '만 14세 이상이며 ', h('a', { href: '#/terms', target: '_blank' }, '이용약관'), '과 ',
          h('a', { href: '#/privacy', target: '_blank' }, '개인정보 처리방침'), '에 동의합니다.')),
      err, submit,
      h('p', { class: 'alt' }, '이미 계정이 있나요? ', h('a', { href: '#/login' }, '로그인')));
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true;
      const fail = m => { err.textContent = m; err.hidden = false; };
      const n = name.value.trim(), em = email.value.trim();
      if (!n) return fail('이름을 입력해 주세요.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return fail('이메일 주소를 확인해 주세요.');
      if (pw.value.length < 8 || !/[A-Za-z]/.test(pw.value) || !/[0-9]/.test(pw.value)) return fail('비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.');
      if (pw.value !== pw2.value) return fail('비밀번호가 서로 달라요.');
      if (!agree.checked) return fail('약관에 동의해 주세요.');
      submit.disabled = true;
      try {
        const r = await withAuth(() => B.signUpEmail(n, em, pw.value));
        if (r.needsConfirm) {
          setPage(h('div', { class: 'auth' }, h('div', { class: 'panel' },
            h('h1', { text: '메일함을 확인해 주세요' }),
            h('p', {}, h('b', { text: em }), ' 주소로 인증 메일을 보냈어요. 메일의 "이메일 인증하기" 버튼을 누르면 가입이 끝나요.'),
            h('p', { class: 'hint', text: '이 브라우저에서 누르면 바로 로그인되고, 휴대폰 등 다른 기기에서 눌렀다면 인증 후 이 화면에서 로그인하면 돼요.' }),
            h('p', { class: 'hint', text: '메일이 안 보이면 스팸함도 확인해 주세요.' }),
            h('a', { class: 'btn', href: '#/login' }, '로그인 화면으로'))));
        } else { me = B.currentUser(); renderNav(); afterLogin(); }
      } catch (ex) { fail(ex.message); }
      finally { submit.disabled = false; }
    });
    setPage(h('div', { class: 'auth' }, form));
    name.focus();
  }

  function viewForgot() {
    const email = h('input', { type: 'email', id: 'fg-email', autocomplete: 'email' });
    const msg = h('p', { class: 'ok-text', hidden: true });
    const err = h('p', { class: 'err-text', hidden: true });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, '재설정 메일 보내기');
    const form = h('form', { class: 'panel', novalidate: true },
      h('h1', { text: '비밀번호 찾기' }),
      h('p', { class: 'hint', text: '가입한 이메일로 비밀번호 재설정 링크를 보내 드려요.' }),
      h('label', { class: 'f' }, '이메일', email), err, msg, submit,
      h('p', { class: 'alt' }, h('a', { href: '#/login' }, '로그인으로 돌아가기')));
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = msg.hidden = true;
      if (!email.value.trim()) { err.textContent = '이메일을 입력해 주세요.'; err.hidden = false; return; }
      submit.disabled = true;
      try {
        await B.sendReset(email.value.trim());
        msg.textContent = B.mode === 'demo' ? '데모 모드에서는 메일이 발송되지 않아요.' : '메일을 보냈어요. 받은 메일함을 확인해 주세요.';
        msg.hidden = false;
      } catch (ex) { store.del(window.EB.RETURN_KEY); err.textContent = ex.message; err.hidden = false; }
      finally { submit.disabled = false; }
    });
    setPage(h('div', { class: 'auth' }, form));
  }

  function viewReset() {
    if (!me) { go('#/login'); return; }
    const pw = h('input', { type: 'password', id: 'rs-pw', autocomplete: 'new-password', placeholder: '영문+숫자 8자 이상' });
    const pw2 = h('input', { type: 'password', id: 'rs-pw2', autocomplete: 'new-password' });
    const err = h('p', { class: 'err-text', hidden: true });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, '비밀번호 바꾸기');
    const form = h('form', { class: 'panel', novalidate: true },
      h('h1', { text: '새 비밀번호 설정' }), h('label', { class: 'f' }, '새 비밀번호', pw), h('label', { class: 'f' }, '새 비밀번호 확인', pw2), err, submit);
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true;
      if (pw.value.length < 8 || !/[A-Za-z]/.test(pw.value) || !/[0-9]/.test(pw.value)) { err.textContent = '비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.'; err.hidden = false; return; }
      if (pw.value !== pw2.value) { err.textContent = '비밀번호가 서로 달라요.'; err.hidden = false; return; }
      submit.disabled = true;
      try {
        await B.updatePassword(pw.value);
        setPage(h('div', { class: 'auth' }, h('div', { class: 'panel' },
          h('h1', { text: '비밀번호를 바꿨어요' }),
          h('p', { class: 'sub', text: '다음 로그인부터 새 비밀번호를 쓰면 돼요.' }),
          h('a', { class: 'btn primary', href: '#/' }, '내 일정으로'))));
      }
      catch (ex) { err.textContent = ex.message; err.hidden = false; submit.disabled = false; }
    });
    setPage(h('div', { class: 'auth' }, form));
  }

  // ───────── dashboard ─────────
  async function viewDashboard() {
    const list = h('div', { class: 'empty', text: '내 여행을 불러오는 중…' });
    setPage(
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end' },
        h('div', {}, h('div', { class: 'eyebrow', text: '내 여행' }), h('h1', { text: `${me.name}님, 이번엔 어디 갈까요?` })),
        h('a', { class: 'btn primary', href: '#/new' }, '+ 새 여행 만들기')),
      list);
    let rows;
    try { rows = await B.myEvents(); }
    catch (e) { list.textContent = '여행 목록을 불러오지 못했어요. 새로고침해 주세요.'; return; }
    const card = ev => {
      const sum = D.tripSummary(ev);
      return h('a', { class: 'card', href: '#/e/' + ev.code },
        h('div', { class: 'badges' },
          ev.is_owner ? h('span', { class: 'badge host', text: '방장' }) : h('span', { class: 'badge', text: '참여' }),
          h('span', { class: 'badge ' + (sum.status === '확정' ? 'ok' : ''), text: sum.status })),
        h('div', { class: 't', text: ev.title }),
        h('div', { class: 'm', text: sum.label }),
        h('div', { class: 'm', text: `멤버 ${ev.member_count || 1}명${ev.is_owner ? '' : ' · 방장 ' + (ev.owner_name || '')}` }));
    };
    const owned = rows.filter(r => r.is_owner), joined = rows.filter(r => !r.is_owner);
    const section = (title, items, empty) => h('section', { class: 'panel' },
      h('h2', { text: title }),
      items.length ? h('div', { class: 'cards' }, items.map(card)) : h('div', { class: 'empty' }, empty));
    list.replaceWith(
      section('내가 만든 여행', owned, ['아직 만든 여행이 없어요. ', h('a', { href: '#/new' }, '첫 여행 만들기')]),
      section('초대받은 여행', joined, '친구에게 받은 초대 링크로 들어가면 여기에 모여요.'));
  }

  // ───────── new trip ─────────
  function viewNew() {
    const t = D.parse(D.today());
    const nmStart = D.iso(new Date(t.getFullYear(), t.getMonth() + 1, 1));
    const nmEnd = D.iso(new Date(t.getFullYear(), t.getMonth() + 2, 0));
    const today = D.today();
    let mode = 'poll', nights = 1, days = 2;
    const title = h('input', { type: 'text', id: 'nw-title', maxlength: '60', placeholder: '예: 1월 팀 엠티, 제주도 3박 4일' });
    const desc = h('textarea', { id: 'nw-desc', rows: '2', maxlength: '500', placeholder: '여행 소개, 예산, 공지 등 (선택)' });
    const pStart = h('input', { type: 'date', id: 'nw-start', value: nmStart });
    const pEnd = h('input', { type: 'date', id: 'nw-end', value: nmEnd });
    const fStart = h('input', { type: 'date', id: 'nw-fstart', value: D.addDays(today, 14) });
    const fEnd = h('input', { type: 'date', id: 'nw-fend', value: D.addDays(today, 15) });
    const nDays = h('input', { type: 'number', id: 'nw-days', min: '1', max: '30', value: '2', inputmode: 'numeric', style: 'max-width:110px' });
    const err = h('p', { class: 'err-text', hidden: true });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, '여행 만들고 초대 링크 받기');

    const modes = [
      ['poll', '날짜 투표로 정하기', '후보 기간을 정하면 멤버들이 안 되는 날을 표시하고, 모두 되는 날을 추천해요.'],
      ['fixed', '날짜가 이미 정해졌어요', '여행 날짜를 바로 넣고 일정표부터 함께 짜요.'],
      ['undecided', '날짜는 미정, 계획부터', '며칠짜리인지만 정하고 계획을 먼저 짜요. 날짜는 나중에 투표하거나 확정할 수 있어요.'],
    ];
    const modeBox = h('div', { class: 'mode-pick', role: 'radiogroup', 'aria-label': '날짜 정하는 방식' });
    const lenSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '여행 길이' });
    const secPoll = h('div', { class: 'ctrls' });
    const secFixed = h('div', { class: 'ctrls' });
    const secUnd = h('div', { class: 'ctrls' });
    const preset = (label, s, e) => h('button', { type: 'button', class: 'btn small', onclick: () => { pStart.value = s; pEnd.value = e; } }, label);
    function draw() {
      modeBox.replaceChildren(...modes.map(([k, name, sub]) => h('button', {
        type: 'button', role: 'radio', class: 'mode-card', 'aria-checked': String(mode === k),
        onclick: () => { mode = k; draw(); }
      }, h('b', { text: name }), h('span', { text: sub }))));
      lenSeg.replaceChildren(...LEN_LABEL.map((l, i) => h('button', { type: 'button', 'aria-pressed': String(i === nights), onclick: () => { nights = i; nDays.value = String(i + 1); draw(); } }, l)));
      secPoll.hidden = mode !== 'poll'; secFixed.hidden = mode !== 'fixed'; secUnd.hidden = mode !== 'undecided';
    }
    secPoll.append(
      h('span', { class: 'eyebrow', text: '후보 기간 (이 안에서 날짜를 골라요)' }),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, '시작일', pStart), h('label', { class: 'f' }, '종료일', pEnd)),
      h('div', { class: 'row' }, preset('다음 달', nmStart, nmEnd), preset('앞으로 2주', today, D.addDays(today, 13)), preset('앞으로 4주', today, D.addDays(today, 27))),
      h('span', { class: 'eyebrow', text: '여행 길이 (추천 기준)' }), lenSeg);
    secFixed.append(
      h('span', { class: 'eyebrow', text: '여행 날짜' }),
      h('div', { class: 'grid2' }, h('label', { class: 'f' }, '출발일', fStart), h('label', { class: 'f' }, '마지막 날', fEnd)));
    secUnd.append(
      h('span', { class: 'eyebrow', text: '며칠짜리 여행인가요?' }),
      h('div', { class: 'row' }, h('label', { class: 'f', style: 'grid-auto-flow:column;align-items:center;gap:8px' }, nDays, '일'),
        h('span', { class: 'hint', text: '예: 1박 2일이면 2일. 나중에 바꿀 수 있어요.' })));
    draw();

    const form = h('form', { class: 'panel', novalidate: true, style: 'max-width:680px;width:100%;margin:0 auto' },
      h('div', {}, h('div', { class: 'eyebrow', text: '방장' }), h('h1', { text: '새 여행 만들기' }),
        h('p', { class: 'sub', text: '여행을 만들면 초대 링크가 생겨요. 링크로 들어온 친구들과 날짜, 일정표, 준비물, 정산, 다이어리를 함께 써요.' })),
      h('label', { class: 'f' }, '여행 이름', title),
      h('label', { class: 'f' }, '소개 (선택)', desc),
      h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '날짜는 어떻게 정할까요?' }), modeBox),
      secPoll, secFixed, secUnd,
      err, submit);
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.hidden = true;
      const fail = m => { err.textContent = m; err.hidden = false; };
      const tv = title.value.trim();
      if (!tv) return fail('여행 이름을 입력해 주세요.');
      const row = { title: tv, description: desc.value.trim(), date_mode: mode };
      if (mode === 'poll') {
        if (!pStart.value || !pEnd.value) return fail('후보 기간의 시작일과 종료일을 골라 주세요.');
        if (pEnd.value < pStart.value) return fail('종료일이 시작일보다 빨라요.');
        const span = D.list(pStart.value, pEnd.value).length;
        if (span > 93) return fail('후보 기간은 최대 93일(약 3개월)까지 정할 수 있어요.');
        if (span < nights + 1) return fail(`${LEN_LABEL[nights]} 일정을 넣기엔 기간이 짧아요.`);
        Object.assign(row, { start_date: pStart.value, end_date: pEnd.value, default_nights: nights, trip_days: nights + 1 });
      } else if (mode === 'fixed') {
        if (!fStart.value || !fEnd.value) return fail('출발일과 마지막 날을 골라 주세요.');
        if (fEnd.value < fStart.value) return fail('마지막 날이 출발일보다 빨라요.');
        const span = D.list(fStart.value, fEnd.value).length;
        if (span > 60) return fail('여행 기간은 최대 60일까지 정할 수 있어요.');
        Object.assign(row, { confirmed_start: fStart.value, confirmed_end: fEnd.value, trip_days: span, default_nights: Math.min(span - 1, 6) });
      } else {
        const n = parseInt(nDays.value, 10);
        if (!(n >= 1 && n <= 30)) return fail('여행 일수는 1일에서 30일 사이로 적어 주세요.');
        Object.assign(row, { trip_days: n, default_nights: Math.min(n - 1, 6) });
      }
      submit.disabled = true;
      try {
        const ev = await B.createEvent(row);
        go('#/e/' + ev.code + '/new');
      } catch (ex) { fail('여행을 만들지 못했어요: ' + (ex.message || ex)); submit.disabled = false; }
    });
    setPage(form);
    title.focus();
  }

  // ───────── account ─────────
  function viewAccount() {
    const nameIn = h('input', { type: 'text', id: 'ac-name', maxlength: '30', value: me.name });
    const nameMsg = h('p', { class: 'ok-text', hidden: true });
    const nameBtn = h('button', { class: 'btn small', type: 'button' }, '이름 저장');
    nameBtn.onclick = async () => {
      const n = nameIn.value.trim(); if (!n) return;
      nameBtn.disabled = true;
      try { me = await B.updateName(n); renderNav(); nameMsg.textContent = '저장했어요. 새로 참여하는 여행부터 이 이름이 쓰여요.'; nameMsg.hidden = false; }
      catch (e) { nameMsg.textContent = e.message; nameMsg.hidden = false; }
      finally { nameBtn.disabled = false; }
    };
    const confirmIn = h('input', { type: 'text', id: 'ac-confirm', placeholder: '탈퇴합니다', autocomplete: 'off' });
    const pwIn = h('input', { type: 'password', id: 'ac-pw', autocomplete: 'current-password' });
    const delErr = h('p', { class: 'err-text', hidden: true });
    const delBtn = h('button', { class: 'btn danger', type: 'submit' }, '회원 탈퇴');
    const delForm = h('form', { class: 'panel danger-zone', novalidate: true },
      h('h2', { text: '회원 탈퇴' }),
      h('p', { class: 'sub', text: '탈퇴하면 아래 정보가 바로 지워지고 되돌릴 수 없어요.' }),
      h('ul', { class: 'plain' },
        h('li', { text: '내 계정(이메일, 이름, 로그인 정보)' }),
        h('li', { text: '내가 방장인 여행 전체와 그 안의 날짜 응답, 일정표, 준비물, 정산, 다이어리, 사진' }),
        h('li', { text: '다른 여행에 남긴 내 날짜 응답, 다이어리 글과 사진, 내가 낸 정산 내역' })),
      h('label', { class: 'f' }, '확인을 위해 "탈퇴합니다"를 입력해 주세요', confirmIn),
      me.provider === 'email' ? h('label', { class: 'f' }, '비밀번호', pwIn) : h('p', { class: 'hint', text: '구글로 가입한 계정이에요. 탈퇴 후 구글 계정 설정의 "타사 앱 연결"에서도 연결을 끊을 수 있어요.' }),
      delErr, h('div', {}, delBtn));
    delForm.addEventListener('submit', async e => {
      e.preventDefault(); delErr.hidden = true;
      if (confirmIn.value.trim() !== '탈퇴합니다') { delErr.textContent = '"탈퇴합니다"를 정확히 입력해 주세요.'; delErr.hidden = false; return; }
      if (me.provider === 'email' && !pwIn.value) { delErr.textContent = '비밀번호를 입력해 주세요.'; delErr.hidden = false; return; }
      delBtn.disabled = true; delBtn.textContent = '지우는 중…';
      try {
        await withAuth(() => B.deleteAccount(pwIn.value));
        me = null; store.del(window.EB.RETURN_KEY); renderNav();
        setPage(h('div', { class: 'auth' }, h('div', { class: 'panel' },
          h('h1', { text: '탈퇴가 완료됐어요' }),
          h('p', { class: 'sub', text: '그동안 이용해 주셔서 고마워요. 계정과 데이터를 모두 지웠어요.' }),
          h('a', { class: 'btn', href: '#/' }, '처음으로'))));
      } catch (ex) { delErr.textContent = ex.message || '탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.'; delErr.hidden = false; delBtn.disabled = false; delBtn.textContent = '회원 탈퇴'; }
    });
    setPage(h('div', { style: 'max-width:640px;width:100%;margin:0 auto;display:grid;gap:20px' },
      h('div', {}, h('div', { class: 'eyebrow', text: '내 정보' }), h('h1', { text: '계정 관리' })),
      h('section', { class: 'panel' },
        h('h2', { text: '프로필' }),
        h('div', { class: 'kv' }, h('span', { text: '이메일' }), h('b', { text: me.email || '-' })),
        h('div', { class: 'kv' }, h('span', { text: '로그인 방식' }), h('b', { text: me.provider === 'google' ? '구글' : '이메일' })),
        h('label', { class: 'f' }, '이름', nameIn), h('div', { class: 'row' }, nameBtn), nameMsg,
        me.provider === 'email' ? h('div', { class: 'row' }, h('a', { class: 'btn small ghost', href: '#/reset' }, '비밀번호 바꾸기')) : null),
      delForm));
  }

  // ───────── event page ─────────
  async function viewEvent(code, justCreated, host) {
    const token = navToken;
    const stale = () => token !== navToken;
    const put = (...n) => host.mount(...n);
    let ev = host.ev;
    try { if (!ev) ev = await B.getEvent(code); }
    catch (e) { if (stale()) return; put(h('div', { class: 'banner err', text: '일정을 불러오지 못했어요. 잠시 후 새로고침해 주세요.' })); return; }
    if (stale()) return;
    if (!ev) {
      put(h('div', { class: 'panel', style: 'max-width:520px;margin:0 auto' },
        h('h1', { text: '일정을 찾을 수 없어요' }),
        h('p', { class: 'sub', text: '링크가 잘못됐거나 방장이 일정을 삭제했어요.' }),
        h('a', { class: 'btn', href: '#/' }, '내 일정으로')));
      return;
    }

    const S = {
      ev, dates: D.list(ev.start_date, ev.end_date),
      entries: {}, myRowId: null, editingKey: 'me', draft: null,
      brush: 'no', dirty: false, saveTimer: null, chain: Promise.resolve(), inflight: 0,
      nights: store.get('eb-n-' + code, ev.default_nights),
      startDows: new Set(store.get('eb-dows-' + code, [0, 1, 2, 3, 4, 5, 6])),
      required: new Set(store.get('eb-req-' + code, [])),
      selected: null, highlight: null, delArmed: false, alive: true,
    };
    const isOwner = () => me && S.ev.owner_id === me.id;
    const readOnly = () => S.ev.closed;
    const dateSet = new Set(S.dates);
    const blankDraft = () => ({ display_name: '', rest: 'ok', days: {}, note: '' });
    const statusOf = (e, d) => (e.days && e.days[d]) || e.rest || 'ok';
    const dowCls = d => { const w = D.dow(d); return (w === 0 ? ' sun' : w === 6 ? ' sat' : '') + (D.HOLIDAYS[d] ? ' hol' : ''); };
    const myKey = () => S.myRowId || 'local-me';
    const editingRowId = () => S.editingKey === 'me' ? myKey() : S.editingKey;
    function displayName(id) {
      const e = S.entries[id];
      const n = e && e.display_name && e.display_name.trim();
      return n || (id === myKey() ? me.name : '이름 없음');
    }
    const isMine = id => id === myKey();
    function respondents() {
      return Object.keys(S.entries).sort((a, b) => isMine(a) ? -1 : isMine(b) ? 1 : displayName(a).localeCompare(displayName(b), 'ko'));
    }

    // ── layout skeleton
    const saveState = h('span', { class: 'save' });
    const closedBanner = h('div', { class: 'banner', hidden: true });
    const ownerBox = h('div', { class: 'row' });

    const whoRow = h('div', { class: 'row', hidden: true });
    const proxyRow = h('div', { class: 'row', hidden: true });
    const nick = h('input', { type: 'text', id: 'ev-nick', maxlength: '30' });
    const modeNo = h('button', { type: 'button' }, '안 되는 날만 고르기');
    const modeOk = h('button', { type: 'button' }, '되는 날만 고르기');
    const modeHint = h('p', { class: 'hint' });
    const brushes = h('div', { class: 'row', role: 'group', 'aria-label': '칠할 상태' });
    const editCal = h('div', { class: 'edit', style: 'display:grid;gap:16px' });
    const qWeekend = h('button', { class: 'btn small', type: 'button' }, '주말 전체 칠하기');
    const qWeekday = h('button', { class: 'btn small', type: 'button' }, '평일 전체 칠하기');
    const qHoliday = h('button', { class: 'btn small', type: 'button' }, '공휴일 칠하기');
    const qClear = h('button', { class: 'btn small ghost', type: 'button' }, '표시 지우기');
    const mySum = h('div', { class: 'mysum' });
    const note = h('textarea', { id: 'ev-note', rows: '2', maxlength: '200', placeholder: '예: 둘째 주는 출장이라 금요일 저녁부터 가능' });
    const delBtn = h('button', { class: 'btn danger small', type: 'button' });

    const respCount = h('span', { class: 'eyebrow' });
    const whoAll = h('div', { class: 'who' });
    const lenSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '일정 길이' });
    const dowSel = h('div', { class: 'dows', role: 'group', 'aria-label': '출발 요일' });
    const recBox = h('div');
    const copyBtn = h('button', { class: 'btn small', type: 'button' }, '결과 텍스트 복사');
    const copyFallback = h('textarea', { class: 'copybox', readonly: true, hidden: true, 'aria-label': '복사할 결과' });
    const heatCal = h('div', { class: 'heat', style: 'display:grid;gap:16px' });
    const dayDetail = h('div', { class: 'detail', hidden: true });
    const mxBox = h('div');

    put(
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        h('p', { class: 'hint', style: 'max-width:60ch', text: '각자 안 되는 날(또는 되는 날)을 표시하면 모두가 되는 날을 추천해요. 방장은 추천 날짜를 골라 "이 날짜로 확정"하면 일정표가 그 날짜로 맞춰져요.' }),
        ownerBox),
      closedBanner,
      h('div', { class: 'cols' },
        h('section', { class: 'panel', 'aria-labelledby': 'h-mine' },
          h('div', { class: 'panel-head' }, h('h2', { id: 'h-mine', text: '내 일정 표시하기' }), saveState),
          whoRow, proxyRow,
          h('label', { class: 'f' }, '표시 이름', nick),
          h('div', { class: 'ctrls' },
            h('span', { class: 'eyebrow', text: '입력 방식' }),
            h('div', { class: 'seg', role: 'group', 'aria-label': '입력 방식' }, modeNo, modeOk),
            modeHint, brushes),
          editCal,
          h('div', { class: 'row' }, qWeekend, qWeekday, qHoliday, qClear),
          mySum,
          h('label', { class: 'f' }, '메모 (선택)', note),
          h('div', { class: 'row', style: 'justify-content:space-between' },
            h('span', { class: 'hint', text: '표시하면 바로 저장되고 다른 사람 화면에도 반영돼요.' }), delBtn)),
        h('section', { class: 'panel', 'aria-labelledby': 'h-res' },
          h('div', { class: 'panel-head' }, h('h2', { id: 'h-res', text: '추천 날짜' }), respCount),
          whoAll,
          h('div', { class: 'ctrls' },
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end' },
              h('div', { style: 'display:grid;gap:6px' }, h('span', { class: 'eyebrow', text: '일정 길이' }), lenSeg),
              h('div', { style: 'display:grid;gap:6px' }, h('span', { class: 'eyebrow', text: '시작 요일' }), dowSel)),
            h('p', { class: 'hint' }, '아래 표에서 ', h('b', { text: '필수' }), '로 체크한 사람이 못 오는 날짜는 추천에서 뒤로 밀려요.')),
          recBox,
          h('div', { class: 'row', style: 'justify-content:flex-end' }, copyBtn),
          copyFallback,
          h('div', { style: 'display:grid;gap:10px' },
            h('span', { class: 'eyebrow', text: '날짜별 가능 인원 (날짜를 누르면 명단이 보여요)' }),
            heatCal,
            h('div', { class: 'legend' },
              h('span', {}, h('i', { class: 'grad' }), '가능 인원 비율'),
              h('span', {}, h('i', { class: 'hatch' }), '필수 인원 불가'),
              h('span', {}, h('i', { class: 'sw ok', style: 'width:10px;height:4px' }), '가능'),
              h('span', {}, h('i', { class: 'sw maybe', style: 'width:10px;height:4px' }), '애매')),
            dayDetail))),
      h('section', { class: 'panel', 'aria-labelledby': 'h-mx' },
        h('div', { class: 'panel-head' }, h('h2', { id: 'h-mx', text: '한눈에 보기' }),
          h('span', { class: 'legend' }, h('span', { text: '○ 가능' }), h('span', { text: '△ 애매' }), h('span', { text: '✕ 불가' }))),
        mxBox));

    // ── header & owner controls
    function renderHead() {
      closedBanner.hidden = !S.ev.closed;
      closedBanner.textContent = isOwner() ? '응답을 마감했어요. 다시 열면 참여자들이 수정할 수 있어요.' : '방장이 응답을 마감했어요. 결과만 볼 수 있어요.';
      ownerBox.replaceChildren();
      if (!isOwner()) return;
      ownerBox.append(h('button', {
        class: 'btn small', type: 'button', onclick: async e => {
          e.target.disabled = true;
          try { S.ev = await B.updateEvent(S.ev.id, { closed: !S.ev.closed }); B.notify(code); renderAll(); host.onChanged && host.onChanged(S.ev); }
          catch (ex) { e.target.disabled = false; }
        }
      }, S.ev.closed ? '응답 다시 받기' : '응답 마감하기'));
    }

    // ── saving
    function setSave(t, err) { saveState.textContent = t; saveState.classList.toggle('err', !!err); }
    function draftRow() {
      const fallback = S.editingKey === 'me' ? me.name : '이름 없음';
      return {
        display_name: (S.draft.display_name || '').trim().slice(0, 30) || fallback,
        rest: S.draft.rest, days: S.draft.days, note: (S.draft.note || '').slice(0, 200),
      };
    }
    function applyLocal() {
      const id = editingRowId();
      S.entries[id] = Object.assign({}, S.entries[id], clone(draftRow()), {
        id, user_id: S.editingKey === 'me' ? me.id : null, updated_at: new Date().toISOString(),
      });
    }
    function touch() {
      if (readOnly()) return;
      S.dirty = true; applyLocal(); scheduleResults();
      setSave('저장 중…');
      clearTimeout(S.saveTimer);
      const key = S.editingKey;
      S.saveTimer = setTimeout(() => flush(key), 600);
    }
    function flush(key) {
      S.saveTimer = null;
      const row = draftRow();
      const target = key;
      S.inflight++;
      S.chain = S.chain.then(() => target === 'me' ? B.saveMyResponse(S.ev.id, row) : B.saveProxyResponse(S.ev.id, Object.assign({ id: target }, row)))
        .then(saved => {
          S.inflight--;
          if (!S.alive) return;
          if (target === 'me' && S.myRowId !== saved.id) { delete S.entries['local-me']; S.myRowId = saved.id; }
          S.entries[saved.id] = saved;
          if (S.saveTimer) applyLocal();
          B.notify(code);
          if (!S.saveTimer && !S.inflight) { S.dirty = false; setSave('저장됨 ✓'); }
          scheduleResults();
        }, err => {
          S.inflight--; S.dirty = false;
          const m = String((err && err.message) || '');
          setSave(/row-level|policy|마감/i.test(m) ? '저장 안 됨: 마감됐거나 권한이 없어요' : '저장 실패, 다시 눌러 주세요', true);
          reload();
        });
    }

    // ── editor
    function setMode(rest) {
      if (S.draft.rest === rest || readOnly()) return;
      // 아직 표시한 게 없으면 방식만 바꾸고, 표시한 게 있으면 보이는 상태를 그대로 유지
      if (Object.keys(S.draft.days).length) {
        const days = {};
        for (const d of S.dates) { const s = statusOf(S.draft, d); if (s !== rest) days[d] = s; }
        S.draft.days = days;
      }
      S.draft.rest = rest;
      S.brush = rest === 'ok' ? 'no' : 'ok';
      touch(); renderEditor();
    }
    function paint(d, value) { if (value) S.draft.days[d] = value; else delete S.draft.days[d]; }
    function monthGrids(container, cell) {
      container.replaceChildren();
      for (const mo of D.months(S.ev.start_date, S.ev.end_date)) {
        const grid = h('div', { class: 'cal' });
        D.DOW.forEach((w, i) => grid.append(h('div', { class: 'dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), text: w })));
        const first = new Date(mo.y, mo.m, 1).getDay();
        for (let i = 0; i < first; i++) grid.append(h('div'));
        const last = new Date(mo.y, mo.m + 1, 0).getDate();
        for (let day = 1; day <= last; day++) {
          const d = `${mo.y}-${D.pad(mo.m + 1)}-${D.pad(day)}`;
          grid.append(dateSet.has(d) ? cell(d, day) : h('div', { class: 'day out', 'aria-hidden': 'true' }, h('span', { class: 'num', text: day })));
        }
        container.append(h('div', { class: 'month' }, h('div', { class: 'month-title', text: mo.label }), grid));
      }
    }
    function renderBrushes() {
      brushes.replaceChildren();
      const opts = S.draft.rest === 'ok' ? ['no', 'maybe'] : ['ok', 'maybe'];
      if (!opts.includes(S.brush)) S.brush = opts[0];
      brushes.append(h('span', { class: 'eyebrow', text: '칠하기:' }));
      for (const o of opts) brushes.append(h('button', {
        class: 'btn small brush', type: 'button', 'aria-pressed': String(S.brush === o), disabled: readOnly(),
        onclick: () => { S.brush = o; renderBrushes(); }
      }, h('i', { class: 'sw ' + o }), o === 'maybe' ? '애매 (조정 가능)' : LABEL[o]));
    }
    function renderEditor() {
      const ro = readOnly();
      modeNo.setAttribute('aria-pressed', String(S.draft.rest === 'ok'));
      modeOk.setAttribute('aria-pressed', String(S.draft.rest === 'no'));
      modeHint.textContent = S.draft.rest === 'ok'
        ? '표시하지 않은 날은 모두 "가능"으로 계산돼요. 안 되는 날만 눌러 주세요.'
        : '표시하지 않은 날은 모두 "불가"로 계산돼요. 되는 날만 눌러 주세요.';
      renderBrushes();
      editCal.classList.toggle('ro', ro);
      monthGrids(editCal, (d, day) => {
        const ex = S.draft.days[d], st = ex || S.draft.rest;
        return h('button', {
          type: 'button', class: `day st-${st} ${ex ? 'set' : 'rest'}${dowCls(d)}`, 'data-d': d, disabled: ro,
          'aria-label': `${D.long(d)} ${D.DOW[D.dow(d)]}요일, ${LABEL[st]}`, 'aria-pressed': String(!!ex),
        }, h('span', { class: 'num', text: day }), h('span', { class: 'tag', text: LABEL[st] }),
          D.HOLIDAYS[d] ? h('span', { class: 'holn', text: D.HOLIDAYS[d] }) : null);
      });
      const c = { ok: 0, maybe: 0, no: 0 };
      for (const d of S.dates) c[statusOf(S.draft, d)]++;
      mySum.replaceChildren(
        h('span', {}, '가능 ', h('b', { text: c.ok }), '일'),
        h('span', {}, '애매 ', h('b', { text: c.maybe }), '일'),
        h('span', {}, '불가 ', h('b', { text: c.no }), '일'));
      if (document.activeElement !== nick) nick.value = S.draft.display_name || '';
      nick.placeholder = S.editingKey === 'me' ? `비워 두면 "${me.name}"` : '팀원 이름';
      if (document.activeElement !== note) note.value = S.draft.note || '';
      for (const el of [nick, note, qWeekend, qWeekday, qHoliday, qClear, modeNo, modeOk]) el.disabled = ro;
      const exists = !!(S.entries[editingRowId()] && (S.editingKey !== 'me' || S.myRowId));
      delBtn.hidden = ro || !exists;
      delBtn.textContent = S.delArmed ? '정말 삭제할까요? 한 번 더 누르기' : (S.editingKey === 'me' ? '내 응답 삭제' : '이 사람 응답 삭제');
      renderWho();
    }
    function renderWho() {
      whoRow.hidden = !isOwner();
      if (whoRow.hidden) return;
      const sel = h('select', { id: 'ev-who', 'aria-label': '누구 일정을 입력하나요?' });
      sel.append(h('option', { value: 'me', text: `나 (${me.name})` }));
      Object.keys(S.entries).filter(id => S.entries[id].user_id == null && id !== 'local-me')
        .sort((a, b) => displayName(a).localeCompare(displayName(b), 'ko'))
        .forEach(id => sel.append(h('option', { value: id, text: displayName(id) + ' (대신 입력)' })));
      sel.value = S.editingKey;
      sel.onchange = () => switchTo(sel.value);
      whoRow.replaceChildren(
        h('label', { class: 'f', style: 'flex:1;min-width:180px' }, '누구 일정을 입력하나요?', sel),
        h('button', { class: 'btn small', type: 'button', style: 'align-self:flex-end', disabled: readOnly(), onclick: () => { proxyRow.hidden = false; proxyName.focus(); } }, '+ 대신 입력'));
    }
    const proxyName = h('input', { type: 'text', id: 'ev-proxy', maxlength: '30', placeholder: '링크로 못 들어오는 사람 이름', style: 'flex:1;min-width:160px' });
    function addProxy() {
      const n = proxyName.value.trim(); if (!n) { proxyName.focus(); return; }
      const id = window.EB.newId() || ('p' + Date.now());
      S.entries[id] = { id, user_id: null, display_name: n, rest: 'ok', days: {}, note: '' };
      proxyRow.hidden = true; proxyName.value = '';
      switchTo(id);
      S.draft.display_name = n; touch();
    }
    proxyRow.append(proxyName,
      h('button', { class: 'btn small primary', type: 'button', onclick: addProxy }, '추가'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { proxyRow.hidden = true; proxyName.value = ''; } }, '취소'));
    proxyName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProxy(); } });

    function switchTo(key) {
      if (S.saveTimer) { clearTimeout(S.saveTimer); flush(S.editingKey); }
      S.editingKey = key; S.delArmed = false;
      const src = S.entries[editingRowId()];
      S.draft = src ? { display_name: key === 'me' ? (src.display_name || '') : src.display_name, rest: src.rest || 'ok', days: clone(src.days || {}), note: src.note || '' } : blankDraft();
      S.brush = S.draft.rest === 'ok' ? 'no' : 'ok';
      renderAll();
    }

    // painting: mouse drag paints, touch taps
    let painting = false, paintValue = null;
    editCal.addEventListener('pointerdown', e => {
      const b = e.target.closest('.day[data-d]'); if (!b || readOnly()) return;
      const d = b.dataset.d;
      paintValue = S.draft.days[d] === S.brush ? null : S.brush;
      paint(d, paintValue);
      if (e.pointerType !== 'touch') { painting = true; e.preventDefault(); }
      renderEditor(); touch();
    });
    editCal.addEventListener('pointerover', e => {
      if (!painting) return;
      const b = e.target.closest('.day[data-d]'); if (!b) return;
      const d = b.dataset.d;
      if ((S.draft.days[d] || null) === paintValue) return;
      paint(d, paintValue); renderEditor(); touch();
    });
    const stopPaint = () => { painting = false; };
    window.addEventListener('pointerup', stopPaint);
    editCal.addEventListener('click', e => {
      if (e.detail !== 0) return; // 키보드(Enter/Space)만
      const b = e.target.closest('.day[data-d]'); if (!b || readOnly()) return;
      const d = b.dataset.d;
      paint(d, S.draft.days[d] === S.brush ? null : S.brush); renderEditor(); touch();
      const again = editCal.querySelector(`[data-d="${d}"]`); if (again) again.focus();
    });
    modeNo.onclick = () => setMode('ok');
    modeOk.onclick = () => setMode('no');
    const fillWhere = pred => { for (const d of S.dates) if (pred(d)) S.draft.days[d] = S.brush; renderEditor(); touch(); };
    qWeekend.onclick = () => fillWhere(d => D.dow(d) === 0 || D.dow(d) === 6);
    qWeekday.onclick = () => fillWhere(d => D.dow(d) > 0 && D.dow(d) < 6 && !D.HOLIDAYS[d]);
    qHoliday.onclick = () => fillWhere(d => !!D.HOLIDAYS[d]);
    qClear.onclick = () => { S.draft.days = {}; renderEditor(); touch(); };
    let typeTimer = null;
    const onText = () => { S.draft.display_name = nick.value; S.draft.note = note.value; clearTimeout(typeTimer); typeTimer = setTimeout(touch, 400); };
    nick.addEventListener('input', onText);
    note.addEventListener('input', onText);
    delBtn.onclick = async () => {
      if (!S.delArmed) { S.delArmed = true; renderEditor(); setTimeout(() => { if (S.delArmed) { S.delArmed = false; renderEditor(); } }, 4000); return; }
      S.delArmed = false; clearTimeout(S.saveTimer); S.saveTimer = null;
      const id = editingRowId();
      try { await S.chain; await B.deleteResponse(id); setSave('삭제됨'); B.notify(code); }
      catch { setSave('삭제하지 못했어요', true); }
      delete S.entries[id];
      if (S.editingKey === 'me') { S.myRowId = null; S.dirty = false; S.draft = blankDraft(); renderAll(); }
      else switchTo('me');
    };

    // ── ranking
    function computeDay(d, ids) {
      const r = { ok: [], maybe: [], no: [] };
      for (const id of ids) r[statusOf(S.entries[id], d)].push(id);
      return r;
    }
    function rank(ids) {
      const L = S.nights + 1, out = [];
      for (let i = 0; i + L <= S.dates.length; i++) {
        const s = S.dates[i];
        if (!S.startDows.has(D.dow(s))) continue;
        const r = { i, s, e: S.dates[i + L - 1], L, ok: [], maybe: [], no: [], blocked: false };
        for (const id of ids) {
          let worst = 'ok';
          for (let k = i; k < i + L; k++) { const st = statusOf(S.entries[id], S.dates[k]); if (RANK[st] > RANK[worst]) worst = st; }
          r[worst].push(id);
          if (worst === 'no' && S.required.has(id)) r.blocked = true;
        }
        out.push(r);
      }
      out.sort((a, b) => (a.blocked - b.blocked) || (a.no.length - b.no.length) || (a.maybe.length - b.maybe.length) || (a.i - b.i));
      return out;
    }
    const names = ids => ids.map(displayName).join(', ');
    const rLabel = r => r.L === 1 ? D.short(r.s) : `${D.short(r.s)} ~ ${D.short(r.e)}`;

    function renderResults() {
      const ids = respondents();
      respCount.textContent = `응답 ${ids.length}명`;
      whoAll.replaceChildren(...ids.map(id => h('span', { class: 'chip' + (isMine(id) ? ' me' : ''), text: displayName(id) + (S.entries[id].user_id == null ? ' *' : '') })));
      lenSeg.replaceChildren(...LEN_LABEL.map((l, i) => h('button', {
        type: 'button', 'aria-pressed': String(i === S.nights), disabled: S.dates.length < i + 1,
        onclick: () => { S.nights = i; store.set('eb-n-' + code, i); S.highlight = null; renderResults(); }
      }, l)));
      dowSel.replaceChildren(...[5, 6, 0, 1, 2, 3, 4].map(i => h('button', {
        type: 'button', text: D.DOW[i], 'aria-pressed': String(S.startDows.has(i)), title: D.DOW[i] + '요일 시작',
        onclick: () => {
          S.startDows.has(i) ? S.startDows.delete(i) : S.startDows.add(i);
          if (!S.startDows.size) S.startDows.add(i);
          store.set('eb-dows-' + code, [...S.startDows]); S.highlight = null; renderResults();
        }
      })));

      recBox.replaceChildren();
      if (!ids.length) {
        recBox.append(h('div', { class: 'empty' }, '아직 응답이 없어요.', h('br'), '링크를 공유하고, 내 일정부터 표시해 보세요.'));
      } else {
        const recs = rank(ids).slice(0, 6);
        if (!recs.length) recBox.append(h('div', { class: 'empty', text: '고른 시작 요일로 가능한 날짜가 없어요.' }));
        const ul = h('ul', { class: 'recs' });
        recs.forEach((r, n) => {
          const total = ids.length;
          const pill = !r.no.length && !r.maybe.length ? h('span', { class: 'pill all', text: '전원 가능' })
            : !r.no.length ? h('span', { class: 'pill part', text: `${r.ok.length}+${r.maybe.length}△/${total}` })
            : h('span', { class: 'pill ' + (r.blocked ? 'bad' : 'part'), text: `${r.ok.length}/${total}` });
          const why = h('div', { class: 'why' });
          if (r.blocked) why.append(h('b', { text: '필수 인원 불가 · ' }));
          if (r.no.length) why.append('불가: ', h('b', { text: names(r.no) }));
          if (r.no.length && r.maybe.length) why.append(' · ');
          if (r.maybe.length) why.append('애매: ', h('b', { text: names(r.maybe) }));
          if (!r.no.length && !r.maybe.length) why.append(`${total}명 모두 가능해요`);
          const on = S.highlight && S.highlight.i === r.i && S.highlight.L === r.L;
          const isConf = S.ev.confirmed_start === r.s && S.ev.confirmed_end === r.e;
          ul.append(h('li', { class: 'rec-li' }, h('button', {
            type: 'button', class: 'rec' + (n === 0 ? ' top' : ''), 'aria-pressed': String(!!on),
            onclick: () => { S.highlight = on ? null : { i: r.i, L: r.L }; S.selected = on ? null : r.s; renderResults(); }
          }, h('span', { class: 'rk', text: n + 1 }),
            h('div', {}, h('div', { class: 'when', text: rLabel(r) + (r.L > 1 ? ` · ${LEN_LABEL[S.nights]}` : '') }), why), pill),
            isOwner() ? h('button', {
              type: 'button', class: 'btn small ' + (isConf ? '' : 'primary'), disabled: isConf,
              onclick: async e => {
                e.target.disabled = true;
                try {
                  S.ev = await B.updateEvent(S.ev.id, { confirmed_start: r.s, confirmed_end: r.e });
                  B.notify(code); host.onChanged && host.onChanged(S.ev, 'plan');
                } catch (ex) { e.target.disabled = false; e.target.textContent = '확정하지 못했어요'; }
              }
            }, isConf ? '확정된 날짜' : '이 날짜로 확정') : (isConf ? h('span', { class: 'badge host', text: '확정' }) : null)));
        });
        recBox.append(ul);
      }

      const hiSet = new Set();
      if (S.highlight) for (let k = S.highlight.i; k < S.highlight.i + S.highlight.L; k++) hiSet.add(S.dates[k]);
      monthGrids(heatCal, (d, day) => {
        const r = computeDay(d, ids), n = ids.length || 1;
        const ratio = ids.length ? r.ok.length / n : 0;
        const blocked = r.no.some(id => S.required.has(id));
        const cell = h('button', {
          type: 'button', class: `day${dowCls(d)}${hiSet.has(d) ? ' inrange' : ''}${S.selected === d ? ' sel' : ''}`,
          'aria-label': `${D.long(d)}: 가능 ${r.ok.length}명, 애매 ${r.maybe.length}명, 불가 ${r.no.length}명`,
          onclick: () => { S.selected = S.selected === d ? null : d; renderResults(); }
        }, h('span', { class: 'num', text: day }),
          D.HOLIDAYS[d] ? h('span', { class: 'holn', text: D.HOLIDAYS[d] }) : null,
          h('span', { class: 'cnt', text: ids.length ? `${r.ok.length}/${ids.length}` : '' }),
          h('span', { class: 'bar' }, h('i', { class: 'b-ok', style: `width:${ratio * 100}%` }), h('i', { class: 'b-maybe', style: `width:${ids.length ? r.maybe.length / n * 100 : 0}%` })));
        if (ids.length) cell.style.background = `color-mix(in oklab, var(--ok) ${Math.round(ratio * 38)}%, var(--surface))`;
        if (blocked && ids.length) cell.style.backgroundImage = 'repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in oklab,var(--no) 22%,transparent) 6px 8px)';
        return cell;
      });

      if (S.selected && ids.length && dateSet.has(S.selected)) {
        const r = computeDay(S.selected, ids);
        dayDetail.hidden = false;
        dayDetail.replaceChildren(h('h3', { text: `${D.long(S.selected)} (${D.DOW[D.dow(S.selected)]})${D.HOLIDAYS[S.selected] ? ' · ' + D.HOLIDAYS[S.selected] : ''}` }));
        for (const k of ['ok', 'maybe', 'no']) {
          if (!r[k].length) continue;
          dayDetail.append(h('div', { class: 'who' }, h('span', { class: 'eyebrow', style: 'align-self:center;min-width:34px', text: LABEL[k] }),
            r[k].map(id => h('span', { class: 'chip ' + k, title: S.entries[id].note || '', text: displayName(id) + (S.entries[id].note ? ' (메모)' : '') }))));
        }
      } else dayDetail.hidden = true;

      renderMatrix(ids);
    }

    function renderMatrix(ids) {
      if (!ids.length) { mxBox.replaceChildren(h('div', { class: 'empty', text: '응답이 모이면 사람별·날짜별 표가 여기에 나타나요.' })); return; }
      const head = h('tr', {}, h('th', { class: 'namecell' }, h('span', { class: 'eyebrow', text: '필수 · 이름' })));
      S.dates.forEach((d, i) => {
        const dt = D.parse(d), w = dt.getDay();
        const mStart = i === 0 || dt.getDate() === 1;
        head.append(h('th', { class: (w === 0 ? 'sun' : w === 6 ? 'sat' : '') + (D.HOLIDAYS[d] ? ' hol' : '') + (mStart && i > 0 ? ' mstart' : ''), title: D.long(d) + (D.HOLIDAYS[d] ? ' ' + D.HOLIDAYS[d] : '') },
          mStart ? `${dt.getMonth() + 1}/${dt.getDate()}` : String(dt.getDate()), h('small', { text: D.DOW[w] })));
      });
      const body = h('tbody');
      for (const id of ids) {
        const e = S.entries[id];
        const cb = h('input', { type: 'checkbox', class: 'req', id: 'req-' + id });
        cb.checked = S.required.has(id);
        cb.addEventListener('change', () => {
          cb.checked ? S.required.add(id) : S.required.delete(id);
          store.set('eb-req-' + code, [...S.required]); renderResults();
        });
        const tr = h('tr', {}, h('td', { class: 'namecell' },
          h('label', { for: 'req-' + id }, cb, h('span', { text: displayName(id) + (isMine(id) ? ' (나)' : '') + (e.user_id == null ? ' *' : '') })),
          e.note ? h('span', { class: 'note', title: e.note, text: e.note }) : null));
        for (const d of S.dates) {
          const st = statusOf(e, d);
          tr.append(h('td', { class: `c ${st}${D.dow(d) === 0 ? ' wk' : ''}`, title: `${displayName(id)} · ${D.short(d)} ${LABEL[st]}`, text: GLYPH[st] }));
        }
        body.append(tr);
      }
      const foot = h('tr', {}, h('td', { class: 'namecell' }, h('span', { class: 'eyebrow', text: '가능 인원' })));
      const counts = S.dates.map(d => computeDay(d, ids).ok.length);
      const max = Math.max(...counts);
      counts.forEach(c => foot.append(h('td', { class: c === max && max > 0 ? 'best' : '', text: c })));
      mxBox.replaceChildren(
        h('div', { class: 'matrix-wrap' }, h('table', { class: 'mx' }, h('thead', {}, head), body, h('tfoot', {}, foot))),
        h('p', { class: 'hint', style: 'margin-top:8px', text: '* 표시는 방장이 대신 입력한 사람이에요. 필수 체크는 내 화면에만 적용돼요.' }));
    }

    copyBtn.onclick = () => {
      const ids = respondents(); if (!ids.length) return;
      const lines = [`[${S.ev.title}] 후보 날짜 · ${LEN_LABEL[S.nights]} · 응답 ${ids.length}명`];
      rank(ids).slice(0, 5).forEach((r, i) => {
        let t = `${i + 1}) ${rLabel(r)} — ` + ((!r.no.length && !r.maybe.length) ? '전원 가능' : `가능 ${r.ok.length}명`);
        if (r.no.length) t += ` / 불가: ${names(r.no)}`;
        if (r.maybe.length) t += ` / 애매: ${names(r.maybe)}`;
        lines.push(t);
      });
      lines.push('', '아직 안 한 사람은 여기서 표시해 주세요 👉 ' + shareUrl(code));
      copyText(lines.join('\n'), copyBtn, copyFallback);
    };

    let raf = 0;
    function scheduleResults() { if (raf) return; raf = setTimeout(() => { raf = 0; if (S.alive) renderResults(); }, 16); }
    function renderAll() { renderHead(); renderEditor(); renderResults(); }

    // ── data
    function ingest(rows) {
      const next = {};
      let mine = null;
      for (const r of rows) { next[r.id] = r; if (r.user_id === me.id) mine = r; }
      S.myRowId = mine ? mine.id : null;
      if (S.dirty) {
        const id = editingRowId();
        if (S.entries[id]) next[id] = S.entries[id];
      }
      S.entries = next;
      if (!S.dirty) {
        if (S.editingKey !== 'me' && !S.entries[S.editingKey]) S.editingKey = 'me';
        const src = S.entries[editingRowId()];
        S.draft = src ? { display_name: src.display_name || '', rest: src.rest || 'ok', days: clone(src.days || {}), note: src.note || '' } : blankDraft();
        if (S.editingKey === 'me' && src && src.display_name === me.name) S.draft.display_name = '';
      }
    }
    let reloading = false;
    async function reload() {
      if (reloading || !S.alive) return;
      reloading = true;
      try {
        const [evNow, rows] = await Promise.all([B.getEvent(code), B.listResponses(code)]);
        if (!S.alive) return;
        if (!evNow) { route(); return; }
        S.ev = evNow;
        ingest(rows || []);
        renderAll();
      } catch (e) { /* 다음 갱신 때 다시 시도 */ }
      finally { reloading = false; }
    }

    try { ingest(await B.listResponses(code)); }
    catch (e) { S.draft = blankDraft(); }
    if (stale()) { S.alive = false; window.removeEventListener('pointerup', stopPaint); return; }
    S.brush = S.draft.rest === 'ok' ? 'no' : 'ok';
    renderAll();
    const unsub = B.subscribe(code, () => { if (!S.dirty) reload(); });
    addCleanup(() => {
      S.alive = false; unsub(); window.removeEventListener('pointerup', stopPaint);
      if (S.saveTimer) { clearTimeout(S.saveTimer); flush(S.editingKey); }
    });
  }

  // ───────── legal (초안) ─────────
  function viewLegal(kind) {
    const doc = (window.EB_LEGAL || {})[kind];
    if (!doc) { setPage(h('div', { class: 'empty', text: '문서를 불러오지 못했어요. 새로고침해 주세요.' })); return; }
    const block = b => {
      if (typeof b === 'string') return h('p', { text: b });
      if (b.ol) return h('ol', {}, b.ol.map(t => h('li', { text: t })));
      if (b.ul) return h('ul', {}, b.ul.map(t => h('li', { text: t })));
      if (b.table) return h('div', { class: 'legal-table' }, h('table', {},
        h('thead', {}, h('tr', {}, b.table.head.map(t => h('th', { text: t })))),
        h('tbody', {}, b.table.rows.map(r => h('tr', {}, r.map(c => h('td', { text: c })))))));
      return null;
    };
    const other = kind === 'terms' ? ['privacy', '개인정보 처리방침'] : ['terms', '이용약관'];
    setPage(h('article', { class: 'panel legal' },
      h('div', {}, h('div', { class: 'eyebrow', text: `시행일 ${doc.effective}` }), h('h1', { text: doc.title })),
      h('p', { class: 'sub', text: doc.intro }),
      h('nav', { class: 'legal-toc', 'aria-label': '목차' },
        doc.sections.map((s, i) => h('a', { href: `#/${kind}`, onclick: e => { e.preventDefault(); document.getElementById('sec-' + i)?.scrollIntoView({ behavior: 'smooth' }); } }, s.h))),
      doc.sections.map((s, i) => h('section', { id: 'sec-' + i, class: 'legal-sec' }, h('h2', { text: s.h }), s.body.map(block))),
      h('p', { class: 'hint' }, h('a', { href: '#/' + other[0] }, other[1] + ' 보기'))));
  }

  // 다른 화면 파일(trip.js)에서 쓰는 공용 도구
  window.EBUI = {
    h, store, clone, go, copyText, setPage, shareUrl, D, B, LEN_LABEL, addCleanup,
    me: () => me, navToken: () => navToken, datePoll: viewEvent, route,
  };

  // ───────── router ─────────
  function route() {
    navToken++;
    cleanups.splice(0).forEach(f => { try { f(); } catch {} });
    const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const [p0, p1, p2] = parts;
    if (!p0) return me ? viewDashboard() : viewLanding();
    if (p0 === 'login') return viewLogin();
    if (p0 === 'signup') return viewSignup();
    if (p0 === 'forgot') return viewForgot();
    if (p0 === 'reset') return viewReset();
    if (p0 === 'terms' || p0 === 'privacy') return viewLegal(p0);
    if (p0 === 'about') return viewLanding();
    if (p0 === 'new') return requireAuth() && viewNew();
    if (p0 === 'e' && p1) return requireAuth() && window.EBTrip.view(p1.toLowerCase().replace(/[^a-z0-9]/g, ''), p2 || '');
    if (p0 === 'account') return requireAuth() && viewAccount();
    go('#/');
  }

  // ───────── boot ─────────
  (async () => {
    const bar = document.getElementById('demoBar');
    bar.hidden = B.mode === 'supabase';
    if (B.mode === 'offline') { bar.textContent = B.loadError; bar.style.background = 'var(--no-soft)'; }
    try { me = await B.init(); } catch { me = null; }
    renderNav();
    B.onAuthChange((event, user) => {
      const was = me && me.id;
      me = user; renderNav();
      if (localAuth) return;
      if (event === 'PASSWORD_RECOVERY') { store.del(window.EB.RETURN_KEY); go('#/reset'); return; }
      if ((user && user.id) !== was && event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') {
        if (event === 'SIGNED_IN' && store.raw(window.EB.RETURN_KEY)) afterLogin(); else route();
      }
    });
    window.addEventListener('hashchange', route);
    const linkError = B.urlError && B.urlError();
    if (linkError) {
      bar.hidden = false; bar.textContent = linkError; bar.style.background = 'var(--no-soft)';
      setTimeout(() => { bar.hidden = B.mode === 'supabase'; }, 12000);
    }
    if (me && B.wasRecovery && B.wasRecovery()) { store.del(window.EB.RETURN_KEY); go('#/reset'); }
    else if (me && store.raw(window.EB.RETURN_KEY)) afterLogin(); else route();
  })();
})();
