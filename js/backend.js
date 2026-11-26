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
  const PHOTO_BUCKET = 'trip-photos';
  const TABLES = ['plan_items', 'checklist_items', 'expenses', 'diary_entries'];
  function tableOk(t) { if (!TABLES.includes(t)) throw new Error('허용되지 않은 데이터예요.'); }

  function friendlyAuthError(e) {
    const m = String((e && e.message) || e || '');
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 아직 안 됐어요. 받은 메일함에서 인증 링크를 눌러 주세요.';
    if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요.';
    if (/Password should be at least|Password should contain|weak/i.test(m)) return '비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.';
    if (/reauthentication|Reauth/i.test(m)) return '보안을 위해 다시 로그인한 뒤 비밀번호를 바꿔 주세요.';
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

      // ── 멤버·초대
      async previewEvent(code) { const rows = must(await sb.rpc('event_preview', { p_code: code })); return rows && rows[0] || null; },
      async joinEvent(code, name) { return must(await sb.rpc('join_event', { p_code: code, p_name: name })); },
      async listMembers(eventId) { return must(await sb.from('event_members').select('*').eq('event_id', eventId).order('joined_at')) || []; },
      async renameMember(eventId, name) {
        must(await sb.from('event_members').update({ display_name: name }).eq('event_id', eventId).eq('user_id', user.id));
      },
      async removeMember(eventId, userId) { must(await sb.rpc('remove_member', { eid: eventId, uid: userId })); },
      async leaveEvent(eventId) { must(await sb.rpc('leave_event', { eid: eventId })); },
      async rotateCode(eventId) { return must(await sb.rpc('rotate_code', { eid: eventId })); },

      // ── 플래너 공용 CRUD (허용된 테이블만)
      async list(table, eventId) {
        tableOk(table);
        return must(await sb.from(table).select('*').eq('event_id', eventId).order('created_at')) || [];
      },
      async insert(table, row) { tableOk(table); return must(await sb.from(table).insert(row).select().single()); },
      async update(table, id, patch) { tableOk(table); return must(await sb.from(table).update(patch).eq('id', id).select().single()); },
      async remove(table, id) { tableOk(table); must(await sb.from(table).delete().eq('id', id)); },

      // ── 사진 (비공개 저장소, 짧은 기간만 유효한 주소로 보여 줌)
      async uploadPhoto(eventId, blob) {
        const path = `${eventId}/${makeCode()}${makeCode()}.jpg`;
        must(await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
        return path;
      },
      async photoUrls(paths) {
        if (!paths.length) return {};
        const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
        if (error) throw error;
        const out = {}; (data || []).forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; }); return out;
      },
      async deletePhotos(paths) { if (paths.length) must(await sb.storage.from(PHOTO_BUCKET).remove(paths)); },

      // ── 회원 탈퇴
      async deleteAccount(password) {
        if (!user) throw new Error('로그인이 필요해요.');
        if (user.provider === 'email') {
          const { error } = await sb.auth.signInWithPassword({ email: user.email, password: password || '' });
          if (error) throw new Error('비밀번호가 맞지 않아요.');
        }
        // 1) 내가 방장인 여행의 사진 폴더 전체, 2) 다른 여행에 올린 내 사진 → 먼저 지움
        const trips = must(await sb.rpc('my_events')) || [];
        for (const t of trips.filter(t => t.is_owner)) {
          const { data } = await sb.storage.from(PHOTO_BUCKET).list(t.id, { limit: 1000 });
          const files = (data || []).map(f => `${t.id}/${f.name}`);
          if (files.length) await sb.storage.from(PHOTO_BUCKET).remove(files);
        }
        const { data: mine } = await sb.from('diary_entries').select('photos').eq('author_id', user.id);
        const myPhotos = (mine || []).flatMap(r => r.photos || []);
        if (myPhotos.length) await sb.storage.from(PHOTO_BUCKET).remove(myPhotos);
        must(await sb.rpc('delete_my_account'));
        await sb.auth.signOut().catch(() => {});
        user = null;
      },

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
    let db = load() || {};
    db = Object.assign({ users: [], session: null, events: [], responses: [], members: [], tables: {}, photos: {} }, db);
    // 예전 데모 데이터: 방장/응답자를 멤버로 채움
    for (const e of db.events) {
      if (!db.members.some(m => m.event_id === e.id && m.user_id === e.owner_id)) db.members.push({ event_id: e.id, user_id: e.owner_id, role: 'owner', display_name: e.owner_name || '방장', joined_at: e.created_at });
      if (!e.date_mode) e.date_mode = 'poll';
    }
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
    const isMem = eid => { const u = me(); return !!u && db.members.some(m => m.event_id === eid && m.user_id === u.id); };

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
        const row = { id: uuid(), code: makeCode(), owner_id: u.id, owner_name: u.name, description: '', closed: false,
          date_mode: 'poll', start_date: null, end_date: null, confirmed_start: null, confirmed_end: null, trip_days: null, created_at: now(), ...ev };
        db.events.push(row);
        db.members.push({ event_id: row.id, user_id: u.id, role: 'owner', display_name: u.name, joined_at: now() });
        save(); return delay(row);
      },
      async getEvent(code) { need(); const e = db.events.find(x => x.code === code); return delay(e && isMem(e.id) ? e : null); },
      async myEvents() {
        const u = need();
        return delay(db.events
          .filter(e => isMem(e.id))
          .map(e => ({ ...e, is_owner: e.owner_id === u.id,
            member_count: db.members.filter(m => m.event_id === e.id).length,
            response_count: db.responses.filter(r => r.event_id === e.id).length }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      async updateEvent(id, patch) {
        const u = need(); const e = db.events.find(x => x.id === id);
        if (!e || e.owner_id !== u.id) throw new Error('방장만 바꿀 수 있어요.');
        Object.assign(e, patch); save(); subs.forEach(fn => fn()); return delay({ ...e });
      },
      async deleteEvent(id) {
        const u = need(); const e = db.events.find(x => x.id === id);
        if (!e || e.owner_id !== u.id) throw new Error('방장만 삭제할 수 있어요.');
        db.events = db.events.filter(x => x.id !== id);
        db.responses = db.responses.filter(r => r.event_id !== id);
        db.members = db.members.filter(m => m.event_id !== id);
        for (const t of Object.keys(db.tables)) db.tables[t] = db.tables[t].filter(r => r.event_id !== id);
        save(); return delay();
      },
      async listResponses(code) {
        need(); const e = db.events.find(x => x.code === code); if (!e || !isMem(e.id)) return [];
        return delay(db.responses.filter(r => r.event_id === e.id).sort((a, b) => a.created_at.localeCompare(b.created_at)));
      },
      async previewEvent(code) {
        need(); const e = db.events.find(x => x.code === code); if (!e) return delay(null);
        return delay({ id: e.id, title: e.title, owner_name: e.owner_name, date_mode: e.date_mode, start_date: e.start_date, end_date: e.end_date,
          confirmed_start: e.confirmed_start, confirmed_end: e.confirmed_end, trip_days: e.trip_days,
          member_count: db.members.filter(m => m.event_id === e.id).length, is_member: isMem(e.id) });
      },
      async joinEvent(code, name) {
        const u = need(); const e = db.events.find(x => x.code === code); if (!e) throw new Error('not found');
        if (!isMem(e.id)) db.members.push({ event_id: e.id, user_id: u.id, role: 'member', display_name: name, joined_at: now() });
        save(); return delay(e.id);
      },
      async listMembers(eventId) { need(); if (!isMem(eventId)) return []; return delay(db.members.filter(m => m.event_id === eventId)); },
      async renameMember(eventId, name) { const u = need(); const m = db.members.find(x => x.event_id === eventId && x.user_id === u.id); if (m) m.display_name = name; save(); },
      async removeMember(eventId, userId) {
        const u = need(); const e = db.events.find(x => x.id === eventId);
        if (!e || e.owner_id !== u.id || userId === u.id) throw new Error('방장만 내보낼 수 있어요.');
        db.members = db.members.filter(m => !(m.event_id === eventId && m.user_id === userId));
        db.responses = db.responses.filter(r => !(r.event_id === eventId && r.user_id === userId)); save();
      },
      async leaveEvent(eventId) {
        const u = need(); const e = db.events.find(x => x.id === eventId);
        if (e && e.owner_id === u.id) throw new Error('방장은 나갈 수 없어요.');
        db.members = db.members.filter(m => !(m.event_id === eventId && m.user_id === u.id));
        db.responses = db.responses.filter(r => !(r.event_id === eventId && r.user_id === u.id)); save();
      },
      async rotateCode(eventId) {
        const u = need(); const e = db.events.find(x => x.id === eventId);
        if (!e || e.owner_id !== u.id) throw new Error('방장만 할 수 있어요.');
        e.code = makeCode() + makeCode().slice(0, 4); save(); return e.code;
      },
      async list(table, eventId) { tableOk(table); need(); if (!isMem(eventId)) return []; return delay((db.tables[table] || []).filter(r => r.event_id === eventId)); },
      async insert(table, row) {
        tableOk(table); const u = need(); if (!isMem(row.event_id)) throw new Error('멤버만 쓸 수 있어요.');
        const r = { id: uuid(), created_at: now(), updated_at: now(), ...(table === 'diary_entries' ? { author_id: u.id } : { created_by: u.id }), ...row };
        (db.tables[table] = db.tables[table] || []).push(r); save(); return delay({ ...r });
      },
      async update(table, id, patch) {
        tableOk(table); need(); const r = (db.tables[table] || []).find(x => x.id === id); if (!r || !isMem(r.event_id)) throw new Error('찾을 수 없어요.');
        Object.assign(r, patch, { updated_at: now() }); save(); return delay({ ...r });
      },
      async remove(table, id) { tableOk(table); need(); db.tables[table] = (db.tables[table] || []).filter(x => x.id !== id); save(); },
      async uploadPhoto(eventId, blob) {
        need(); const path = `${eventId}/${makeCode()}${makeCode()}.jpg`;
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
        db.photos[path] = url; save(); return path;
      },
      async photoUrls(paths) { const out = {}; paths.forEach(p => { if (db.photos[p]) out[p] = db.photos[p]; }); return out; },
      async deletePhotos(paths) { paths.forEach(p => delete db.photos[p]); save(); },
      async deleteAccount(password) {
        const u = need(); const row = db.users.find(x => x.id === u.id);
        if (row.provider === 'email' && row.pw !== await hash(password || '')) throw new Error('비밀번호가 맞지 않아요.');
        for (const e of db.events.filter(x => x.owner_id === u.id)) await this.deleteEvent(e.id);
        db.members = db.members.filter(m => m.user_id !== u.id);
        db.responses = db.responses.filter(r => r.user_id !== u.id);
        // 실제 DB 와 같게: 내가 낸 정산, 내 다이어리 글은 함께 삭제
        db.tables.expenses = (db.tables.expenses || []).filter(r => r.paid_by !== u.id);
        db.tables.diary_entries = (db.tables.diary_entries || []).filter(r => r.author_id !== u.id);
        db.users = db.users.filter(x => x.id !== u.id); db.session = null; save(); emit('SIGNED_OUT');
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
    const base = {
      mode: 'offline', loadError: msg,
      async init() { return null; }, currentUser: () => null, onAuthChange() { return () => {}; },
      signOut: async () => {}, subscribe() { return () => {}; }, notify() {},
    };
    return new Proxy(base, { get: (t, k) => (k in t ? t[k] : fail) });
  }

  const hasKeys = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  window.EB = window.EB || {};
  window.EB.RETURN_KEY = RETURN_KEY;
  window.EB.backend = !hasKeys ? demoBackend() : (window.supabase ? supabaseBackend() : offlineBackend());
  window.EB.newId = () => (crypto.randomUUID ? crypto.randomUUID() : undefined);
})();
