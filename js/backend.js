// 얘들아 이제는 진짜 정해야해 — 백엔드 어댑터
// Supabase(실서비스)와 localStorage(데모) 두 구현이 같은 인터페이스를 가집니다.
(function () {
  const cfg = window.EB_CONFIG || {};
  const RETURN_KEY = 'eb-return';

  function nameOf(u) {
    if (!u) return null;
    const m = u.user_metadata || {};
    return {
      id: u.id,
      email: u.email || '',
      name: (m.full_name || m.name || (u.email || '').split('@')[0] || '사용자').slice(0, 30),
      provider: (u.app_metadata && u.app_metadata.provider) || 'email',
    };
  }
  function makeCode() {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    const buf = new Uint32Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, n => a[n % a.length]).join('');
  }
  function friendlyAuthError(e) {
    const m = String((e && e.message) || e || '');
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 아직 안 됐어요. 받은 메일함에서 인증 링크를 눌러 주세요.';
    if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요.';
    if (/Password should be at least/i.test(m)) return '비밀번호는 8자 이상이어야 해요.';
    if (/rate limit|too many/i.test(m)) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
    if (/provider is not enabled/i.test(m)) return '구글 로그인이 아직 설정되지 않았어요. (Supabase > Authentication > Providers)';
    return m || '알 수 없는 오류가 발생했어요.';
  }

  // ═════════════════════════════════════════
  // Supabase
  // ═════════════════════════════════════════
  function supabaseBackend() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    const channels = {};
    let user = null;
    const listeners = new Set();
    const baseUrl = () => location.origin + location.pathname;

    // 메일 링크로 들어온 경우를 기억 (앱이 리스너를 붙이기 전에 이벤트가 먼저 올 수 있음)
    let recovery = /[?&#]type=recovery/.test(location.href);
    let urlError = null;
    {
      const q = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));
      const desc = q.get('error_description') || q.get('error');
      if (desc) urlError = /expired|invalid/i.test(desc)
        ? '메일 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.'
        : '메일 링크로 로그인하지 못했어요: ' + desc;
    }

    sb.auth.onAuthStateChange((event, session) => {
      user = nameOf(session && session.user);
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      listeners.forEach(fn => fn(event, user));
    });

    const must = ({ data, error }) => { if (error) throw error; return data; };

    return {
      mode: 'supabase',
      async init() {
        const hadCode = /[?&]code=/.test(location.search);
        const { data } = await sb.auth.getSession();
        user = nameOf(data.session && data.session.user);
        // 링크의 code 를 다른 브라우저에서 열면 교환이 실패한다 (요청한 브라우저에만 열쇠가 있음)
        if (hadCode && !user && !urlError) urlError = recovery || /reset/.test(localStorage.getItem(RETURN_KEY) || '')
          ? '비밀번호 재설정 링크는 재설정을 요청한 브라우저에서 열어야 해요. 그 브라우저에서 다시 열거나 새로 요청해 주세요.'
          : '이메일 인증이 끝났어요. 이 브라우저에서는 로그인만 하면 돼요.';
        if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
        return user;
      },
      wasRecovery: () => recovery,
      urlError: () => urlError,
      currentUser: () => user,
      onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      async signInGoogle(returnHash) {
        try { localStorage.setItem(RETURN_KEY, JSON.stringify(returnHash || '#/')); } catch {}
        const { error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: baseUrl(), queryParams: { prompt: 'select_account' } },
        });
        if (error) throw new Error(friendlyAuthError(error));
      },
      async signInEmail(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(friendlyAuthError(error));
        user = nameOf(data.user); return user;
      },
      async signUpEmail(name, email, password) {
        const { data, error } = await sb.auth.signUp({
          email, password, options: { data: { full_name: name }, emailRedirectTo: baseUrl() },
        });
        if (error) throw new Error(friendlyAuthError(error));
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
          throw new Error('이미 가입된 이메일이에요. 로그인해 주세요.');
        if (data.session) { user = nameOf(data.user); return { needsConfirm: false }; }
        return { needsConfirm: true };
      },
      async sendReset(email) {
        try { localStorage.setItem(RETURN_KEY, JSON.stringify('#/reset')); } catch {}
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: baseUrl() });
        if (error) throw new Error(friendlyAuthError(error));
      },
      async updatePassword(password) {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw new Error(friendlyAuthError(error));
      },
      async updateName(name) {
        const { data, error } = await sb.auth.updateUser({ data: { full_name: name } });
        if (error) throw new Error(friendlyAuthError(error));
        user = nameOf(data.user); return user;
      },
      async signOut() { await sb.auth.signOut(); user = null; },

      async createEvent(ev) {
        for (let i = 0; i < 4; i++) {
          const row = { ...ev, code: makeCode(), owner_id: user.id, owner_name: user.name };
          const { data, error } = await sb.from('events').insert(row).select().single();
          if (!error) return data;
          if (error.code !== '23505') throw error;
        }
        throw new Error('일정 주소를 만들지 못했어요. 다시 시도해 주세요.');
      },
      async getEvent(code) {
        const rows = must(await sb.rpc('get_event', { p_code: code }));
        return rows && rows[0] || null;
      },
      async myEvents() { return must(await sb.rpc('my_events')) || []; },
      async updateEvent(id, patch) { return must(await sb.from('events').update(patch).eq('id', id).select().single()); },
      async deleteEvent(id) { must(await sb.from('events').delete().eq('id', id)); },
      async listResponses(code) { return must(await sb.rpc('list_responses', { p_code: code })) || []; },
      async saveMyResponse(eventId, r) {
        const row = { event_id: eventId, user_id: user.id, display_name: r.display_name, rest: r.rest, days: r.days, note: r.note };
        return must(await sb.from('responses').upsert(row, { onConflict: 'event_id,user_id' }).select().single());
      },
      async saveProxyResponse(eventId, r) {
        const row = { id: r.id, event_id: eventId, user_id: null, display_name: r.display_name, rest: r.rest, days: r.days, note: r.note };
        return must(await sb.from('responses').upsert(row, { onConflict: 'id' }).select().single());
      },
      async deleteResponse(id) { must(await sb.from('responses').delete().eq('id', id)); },

      subscribe(code, onChange) {
        const ch = sb.channel('eb-' + code, { config: { broadcast: { self: false } } });
        ch.on('broadcast', { event: 'changed' }, () => onChange()).subscribe();
        channels[code] = ch;
        const timer = setInterval(onChange, 30000);
        const onFocus = () => { if (document.visibilityState === 'visible') onChange(); };
        document.addEventListener('visibilitychange', onFocus);
        return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onFocus);
          sb.removeChannel(ch); delete channels[code];
        };
      },
      notify(code) {
        const ch = channels[code];
        if (ch) ch.send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {});
      },
    };
  }

  // ═════════════════════════════════════════
  // 데모 (localStorage) — 키 없이 바로 체험
  // ═════════════════════════════════════════
  function demoBackend() {
    const KEY = 'eb-demo-v1';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
    let db = load() || { users: [], session: null, events: [], responses: [] };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
    const listeners = new Set();
    const subs = new Set();
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + makeCode() + makeCode());
    const now = () => new Date().toISOString();
    const delay = (v) => new Promise(r => setTimeout(() => r(v), 120));
    async function hash(s) {
      try {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('eb-demo:' + s));
        return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
      } catch { return 'plain:' + btoa(unescape(encodeURIComponent(s))); }
    }
    const toUser = u => u && { id: u.id, email: u.email, name: u.name, provider: u.provider };
    const me = () => toUser(db.users.find(u => u.id === db.session));
    const emit = (ev) => { const u = me(); listeners.forEach(fn => fn(ev, u)); };
    window.addEventListener('storage', e => {
      if (e.key !== KEY) return;
      const before = db.session;
      db = load() || db;
      if (before !== db.session) emit(db.session ? 'SIGNED_IN' : 'SIGNED_OUT');
      subs.forEach(fn => fn());
    });
    const need = () => { const u = me(); if (!u) throw new Error('로그인이 필요해요.'); return u; };

    return {
      mode: 'demo',
      async init() { return me(); },
      currentUser: me,
      onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      async signInGoogle() {
        let u = db.users.find(x => x.provider === 'google');
        if (!u) { u = { id: uuid(), email: 'google-demo@example.com', name: '구글 데모 사용자', provider: 'google' }; db.users.push(u); }
        db.session = u.id; save(); emit('SIGNED_IN'); return delay(toUser(u));
      },
      async signInEmail(email, password) {
        const u = db.users.find(x => x.email === email.toLowerCase() && x.provider === 'email');
        if (!u || u.pw !== await hash(password)) throw new Error('이메일 또는 비밀번호가 맞지 않아요.');
        db.session = u.id; save(); emit('SIGNED_IN'); return delay(toUser(u));
      },
      async signUpEmail(name, email, password) {
        email = email.toLowerCase();
        if (db.users.some(x => x.email === email)) throw new Error('이미 가입된 이메일이에요. 로그인해 주세요.');
        const u = { id: uuid(), email, name, provider: 'email', pw: await hash(password) };
        db.users.push(u); db.session = u.id; save(); emit('SIGNED_IN');
        return delay({ needsConfirm: false });
      },
      async sendReset() { return delay(); },
      async updatePassword(password) { const u = db.users.find(x => x.id === need().id); u.pw = await hash(password); save(); },
      async updateName(name) { const u = db.users.find(x => x.id === need().id); u.name = name; save(); emit('USER_UPDATED'); return toUser(u); },
      async signOut() { db.session = null; save(); emit('SIGNED_OUT'); },

      async createEvent(ev) {
        const u = need();
        const row = { id: uuid(), code: makeCode(), owner_id: u.id, owner_name: u.name, description: '', closed: false, created_at: now(), ...ev };
        db.events.push(row); save(); return delay(row);
      },
      async getEvent(code) { need(); return delay(db.events.find(e => e.code === code) || null); },
      async myEvents() {
        const u = need();
        return delay(db.events
          .filter(e => e.owner_id === u.id || db.responses.some(r => r.event_id === e.id && r.user_id === u.id))
          .map(e => ({ ...e, is_owner: e.owner_id === u.id, response_count: db.responses.filter(r => r.event_id === e.id).length }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      async updateEvent(id, patch) {
        const u = need(); const e = db.events.find(x => x.id === id);
        if (!e || e.owner_id !== u.id) throw new Error('방장만 바꿀 수 있어요.');
        Object.assign(e, patch); save(); subs.forEach(fn => fn()); return delay(e);
      },
      async deleteEvent(id) {
        const u = need(); const e = db.events.find(x => x.id === id);
        if (!e || e.owner_id !== u.id) throw new Error('방장만 삭제할 수 있어요.');
        db.events = db.events.filter(x => x.id !== id);
        db.responses = db.responses.filter(r => r.event_id !== id); save(); return delay();
      },
      async listResponses(code) {
        need(); const e = db.events.find(x => x.code === code); if (!e) return [];
        return delay(db.responses.filter(r => r.event_id === e.id).sort((a, b) => a.created_at.localeCompare(b.created_at)));
      },
      async saveMyResponse(eventId, r) {
        const u = need(); const e = db.events.find(x => x.id === eventId);
        if (!e || e.closed) throw new Error('마감된 일정이에요.');
        let row = db.responses.find(x => x.event_id === eventId && x.user_id === u.id);
        if (!row) { row = { id: uuid(), event_id: eventId, user_id: u.id, created_by: u.id, created_at: now() }; db.responses.push(row); }
        Object.assign(row, { display_name: r.display_name, rest: r.rest, days: r.days, note: r.note, updated_at: now() });
        save(); return delay({ ...row });
      },
      async saveProxyResponse(eventId, r) {
        const u = need(); const e = db.events.find(x => x.id === eventId);
        if (!e || e.owner_id !== u.id) throw new Error('방장만 대신 입력할 수 있어요.');
        if (e.closed) throw new Error('마감된 일정이에요.');
        let row = db.responses.find(x => x.id === r.id);
        if (!row) { row = { id: r.id || uuid(), event_id: eventId, user_id: null, created_by: u.id, created_at: now() }; db.responses.push(row); }
        Object.assign(row, { display_name: r.display_name, rest: r.rest, days: r.days, note: r.note, updated_at: now() });
        save(); return delay({ ...row });
      },
      async deleteResponse(id) {
        const u = need(); const row = db.responses.find(x => x.id === id); if (!row) return;
        const e = db.events.find(x => x.id === row.event_id);
        if (row.user_id !== u.id && (!e || e.owner_id !== u.id)) throw new Error('삭제 권한이 없어요.');
        db.responses = db.responses.filter(x => x.id !== id); save(); return delay();
      },
      subscribe(code, onChange) { subs.add(onChange); return () => subs.delete(onChange); },
      notify() {},
    };
  }

  // 서버 설정은 있는데 Supabase 라이브러리를 못 불러온 경우(광고 차단, 네트워크 등):
  // 데모로 몰래 넘어가지 않고, 모든 동작에서 원인을 알려 준다.
  function offlineBackend() {
    const msg = '서버 연결 도구를 불러오지 못했어요. 광고 차단 프로그램을 끄거나 새로고침해 주세요.';
    const fail = async () => { throw new Error(msg); };
    return {
      mode: 'offline', loadError: msg,
      async init() { return null; }, currentUser: () => null, onAuthChange() { return () => {}; },
      signInGoogle: fail, signInEmail: fail, signUpEmail: fail, sendReset: fail, updatePassword: fail,
      updateName: fail, signOut: async () => {}, createEvent: fail, getEvent: fail, myEvents: fail,
      updateEvent: fail, deleteEvent: fail, listResponses: fail, saveMyResponse: fail,
      saveProxyResponse: fail, deleteResponse: fail, subscribe() { return () => {}; }, notify() {},
    };
  }

  const hasKeys = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  window.EB = window.EB || {};
  window.EB.RETURN_KEY = RETURN_KEY;
  window.EB.backend = !hasKeys ? demoBackend() : (window.supabase ? supabaseBackend() : offlineBackend());
  window.EB.newId = () => (crypto.randomUUID ? crypto.randomUUID() : undefined);
})();
