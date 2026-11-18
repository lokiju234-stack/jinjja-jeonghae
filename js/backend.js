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

    sb.auth.onAuthStateChange((event, session) => {
      user = nameOf(session && session.user);
      listeners.forEach(fn => fn(event, user));
    });

    const must = ({ data, error }) => { if (error) throw error; return data; };

    return {
      mode: 'supabase',
      async init() {
        const { data } = await sb.auth.getSession();
        user = nameOf(data.session && data.session.user);
        if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
        return user;
      },
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

  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  window.EB = window.EB || {};
  window.EB.RETURN_KEY = RETURN_KEY;
  window.EB.backend = useSupabase ? supabaseBackend() : demoBackend();
  window.EB.newId = () => (crypto.randomUUID ? crypto.randomUUID() : undefined);
})();
