// 얘들아 이제는 진짜 정해야해 — 여행 화면 (초대 참여, 날짜, 일정표, 준비물, 정산, 다이어리, 멤버)
(function () {
  const TABS = [
    ['dates', '날짜'], ['plan', '일정표'], ['check', '준비물'], ['money', '정산'], ['diary', '다이어리'], ['people', '멤버·설정'],
  ];
  const CATS = { move: '이동', food: '식사', sight: '관광', stay: '숙소', activity: '활동', shop: '쇼핑', etc: '기타' };
  const MOODS = { best: '최고', good: '좋음', soso: '보통', tired: '피곤' };
  const enc = encodeURIComponent;
  const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
  const mapLinks = place => [
    ['구글 지도', `https://www.google.com/maps/search/?api=1&query=${enc(place)}`],
    ['네이버 지도', `https://map.naver.com/p/search/${enc(place)}`],
    ['카카오맵', `https://map.kakao.com/link/search/${enc(place)}`],
  ];
  const routeUrl = places => `https://www.google.com/maps/dir/${places.map(enc).join('/')}`;

  // 사진: 긴 변 1600px JPEG 로 다시 그려서 올림 (용량 절약 + 위치 정보 등 사진 속 메타데이터 제거)
  async function shrinkPhoto(file) {
    if (!/^image\//.test(file.type || '')) throw new Error('사진 파일만 올릴 수 있어요.');
    if (file.size > 25 * 1024 * 1024) throw new Error('25MB보다 큰 사진은 올릴 수 없어요.');
    let src, w, hh;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; hh = src.height; }
    catch {
      src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('이 사진 형식은 열 수 없어요. JPG나 PNG로 올려 주세요.')); im.src = URL.createObjectURL(file); });
      w = src.naturalWidth; hh = src.naturalHeight;
    }
    const k = Math.min(1, 1600 / Math.max(w, hh));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('사진을 처리하지 못했어요.');
    return blob;
  }

  async function view(code, sub) {
    const U = window.EBUI;
    const { h, B, D, setPage, go, copyText, shareUrl, addCleanup } = U;
    const me = U.me();
    const token = U.navToken();
    const stale = () => token !== U.navToken();
    const justCreated = sub === 'new';
    setPage(h('div', { class: 'empty', text: '여행을 불러오는 중…' }));

    let pv;
    try { pv = await B.previewEvent(code); }
    catch (e) { if (!stale()) setPage(h('div', { class: 'banner err', text: '여행을 불러오지 못했어요. 잠시 후 새로고침해 주세요.' })); return; }
    if (stale()) return;
    if (!pv) {
      setPage(h('div', { class: 'panel', style: 'max-width:520px;margin:0 auto' },
        h('h1', { text: '여행을 찾을 수 없어요' }),
        h('p', { class: 'sub', text: '초대 링크가 잘못됐거나, 방장이 링크를 새로 만들었거나, 여행이 삭제됐어요. 방장에게 새 링크를 받아 주세요.' }),
        h('a', { class: 'btn', href: '#/' }, '내 여행으로')));
      return;
    }
    if (!pv.is_member) return joinPage(pv);

    let ev, members;
    try { [ev, members] = await Promise.all([B.getEvent(code), B.listMembers(pv.id)]); }
    catch (e) { if (!stale()) setPage(h('div', { class: 'banner err', text: '여행을 불러오지 못했어요. 잠시 후 새로고침해 주세요.' })); return; }
    if (stale()) return;
    if (!ev) { go('#/'); return; }

    const isOwner = ev.owner_id === me.id;
    const tabKeys = TABS.map(t => t[0]);
    const defTab = ev.date_mode === 'poll' && !ev.confirmed_start ? 'dates' : 'plan';
    const tab = tabKeys.includes(sub) ? sub : defTab;
    const memberName = uid => { const m = members.find(x => x.user_id === uid); return m ? m.display_name : '나간 멤버'; };
    const days = D.tripDays(ev);
    const dayDate = i => (ev.confirmed_start ? D.addDays(ev.confirmed_start, i) : null);
    const dayLabel = i => `${i + 1}일차` + (dayDate(i) ? ' · ' + D.short(dayDate(i)) : '');
    const notify = () => B.notify(code);

    // ── 머리말: 제목, 날짜 요약, 초대
    const sum = D.tripSummary(ev);
    const inviteText = () => `[${ev.title}] 같이 정해요! 여기서 참여해 주세요 👉 ${shareUrl(code)}`;
    const linkInput = h('input', { type: 'text', readonly: true, id: 'invite-link', value: shareUrl(code), 'aria-label': '초대 링크', onfocus: e => e.target.select() });
    const copyLink = h('button', { class: 'btn primary small', type: 'button', onclick: () => copyText(shareUrl(code), copyLink, linkInput) }, '초대 링크 복사');
    const copyMsg = h('button', { class: 'btn small', type: 'button', onclick: () => copyText(inviteText(), copyMsg, linkInput) }, '초대 메시지 복사');
    const shareBtn = navigator.share ? h('button', { class: 'btn small', type: 'button', onclick: () => navigator.share({ title: ev.title, text: `[${ev.title}] 같이 정해요!`, url: shareUrl(code) }).catch(() => {}) }, '공유하기') : null;
    const tabNav = h('nav', { class: 'tabs', 'aria-label': '여행 메뉴' },
      TABS.map(([k, label]) => h('a', { href: `#/e/${code}/${k}`, class: 'tab', 'aria-current': k === tab ? 'page' : null }, label)));
    const body = h('div', { class: 'tab-body' });
    setPage(
      h('section', { class: 'panel ev-head' },
        justCreated ? h('div', { class: 'banner info' }, h('b', { text: '여행이 만들어졌어요! ' }), '아래 초대 링크를 단톡방에 보내 친구들을 불러 주세요.') : null,
        h('div', {},
          h('div', { class: 'eyebrow', text: `방장 ${ev.owner_name || ''} · 멤버 ${members.length}명` }),
          h('h1', { text: ev.title }),
          h('div', { class: 'row', style: 'gap:8px;margin-top:6px' },
            h('span', { class: 'badge ' + (sum.status === '확정' ? 'ok' : ''), text: sum.status }),
            h('span', { class: 'sub', style: 'margin:0', text: sum.label }))),
        ev.description ? h('p', { class: 'ev-desc', text: ev.description }) : null,
        h('details', { class: 'invite', open: justCreated || null },
          h('summary', {}, '친구 초대하기'),
          h('div', { class: 'share' }, linkInput),
          h('div', { class: 'row' }, copyLink, copyMsg, shareBtn),
          h('p', { class: 'hint', text: '링크를 받은 사람은 로그인한 뒤 "참여하기"를 누르면 멤버가 돼요. 링크가 퍼졌다면 멤버·설정에서 링크를 새로 만들 수 있어요.' }))),
      tabNav, body);

    const mount = (...n) => body.replaceChildren(...n);
    let refresh = null;
    if (tab !== 'dates') {
      const unsub = B.subscribe(code, () => { if (refresh) refresh(); });
      addCleanup(unsub);
    }
    const renderers = { dates: tabDates, plan: tabPlan, check: tabCheck, money: tabMoney, diary: tabDiary, people: tabPeople };
    renderers[tab]();

    // ═══════════════ 참여 화면 ═══════════════
    function joinPage(p) {
      const nameIn = h('input', { type: 'text', id: 'join-name', maxlength: '30', value: me.name });
      const err = h('p', { class: 'err-text', hidden: true });
      const btn = h('button', { class: 'btn primary big', type: 'submit' }, '참여하기');
      const s = D.tripSummary(p);
      const form = h('form', { class: 'panel', novalidate: true },
        h('div', { class: 'eyebrow', text: `${p.owner_name || '방장'}님이 초대했어요` }),
        h('h1', { text: p.title }),
        h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'badge', text: s.status }), h('span', { class: 'sub', style: 'margin:0', text: s.label })),
        h('p', { class: 'sub', text: `지금 ${p.member_count}명이 함께하고 있어요. 참여하면 날짜 맞추기, 일정표, 준비물, 정산, 다이어리를 같이 쓸 수 있어요.` }),
        h('label', { class: 'f' }, '이 여행에서 쓸 내 이름', nameIn),
        h('p', { class: 'hint', text: '참여하면 이 이름과 내가 입력한 내용이 이 여행의 다른 멤버에게 보여요.' }),
        err, btn);
      form.addEventListener('submit', async e => {
        e.preventDefault(); err.hidden = true;
        const n = nameIn.value.trim();
        if (!n) { err.textContent = '이름을 입력해 주세요.'; err.hidden = false; return; }
        btn.disabled = true;
        try { await B.joinEvent(code, n); U.route(); }
        catch (ex) {
          const m = String(ex.message || '');
          err.textContent = /limit/.test(m) ? '이 여행은 인원이 가득 찼어요(최대 100명).' : '참여하지 못했어요. 링크가 바뀌었는지 방장에게 확인해 주세요.';
          err.hidden = false; btn.disabled = false;
        }
      });
      setPage(h('div', { class: 'auth' }, form));
      nameIn.focus();
    }

    // ═══════════════ 날짜 ═══════════════
    function tabDates() {
      const top = h('div', { style: 'display:grid;gap:16px' });
      const pollBox = h('div', { style: 'display:grid;gap:20px' });
      mount(top, pollBox);
      if (ev.confirmed_start) {
        top.append(h('div', { class: 'banner info row', style: 'justify-content:space-between' },
          h('span', {}, h('b', { text: '여행 날짜 확정: ' }), D.rangeText(ev.confirmed_start, ev.confirmed_end)),
          h('a', { class: 'btn small', href: `#/e/${code}/plan` }, '일정표 짜러 가기')));
      }
      if (ev.date_mode === 'poll' && ev.start_date) {
        U.datePoll(code, false, {
          mount: (...n) => pollBox.replaceChildren(...n), ev,
          onChanged: (_e, goTab) => { if (goTab === 'plan') go(`#/e/${code}/plan`); else U.route(); },
        });
        return;
      }
      // 투표 없이 쓰는 여행: 날짜 확정 또는 투표 시작
      pollBox.append(h('section', { class: 'panel' },
        h('h2', { text: ev.confirmed_start ? '날짜가 정해졌어요' : '아직 날짜를 정하지 않았어요' }),
        h('p', { class: 'sub', text: ev.confirmed_start ? '날짜를 바꾸거나 멤버들에게 다시 투표를 받을 수 있어요.' : `${D.nightsLabel(days)} 여행으로 계획 중이에요. 날짜를 바로 정하거나, 멤버들에게 되는 날을 받아 보세요.` }),
        isOwner ? dateTools() : h('p', { class: 'hint', text: '날짜는 방장이 정할 수 있어요. 그동안 일정표부터 함께 짜 보세요.' })));
    }
    function dateTools() {
      const st = h('input', { type: 'date', id: 'dt-start', value: ev.confirmed_start || D.addDays(D.today(), 14) });
      const nd = h('input', { type: 'number', id: 'dt-days', min: '1', max: '60', value: String(days), style: 'max-width:100px' });
      const ps = h('input', { type: 'date', id: 'dt-pstart', value: D.addDays(D.today(), 7) });
      const pe = h('input', { type: 'date', id: 'dt-pend', value: D.addDays(D.today(), 37) });
      const err = h('p', { class: 'err-text', hidden: true });
      const fail = m => { err.textContent = m; err.hidden = false; };
      const confirmBtn = h('button', { class: 'btn primary small', type: 'button' }, '이 날짜로 확정');
      confirmBtn.onclick = async () => {
        err.hidden = true;
        const n = parseInt(nd.value, 10);
        if (!st.value) return fail('출발일을 골라 주세요.');
        if (!(n >= 1 && n <= 60)) return fail('여행 일수는 1~60일 사이로 적어 주세요.');
        confirmBtn.disabled = true;
        try { await B.updateEvent(ev.id, { confirmed_start: st.value, confirmed_end: D.addDays(st.value, n - 1), trip_days: n }); notify(); go(`#/e/${code}/plan`); }
        catch (e) { fail('저장하지 못했어요: ' + e.message); confirmBtn.disabled = false; }
      };
      const pollBtn = h('button', { class: 'btn small', type: 'button' }, '이 기간으로 날짜 투표 시작');
      pollBtn.onclick = async () => {
        err.hidden = true;
        if (!ps.value || !pe.value || pe.value < ps.value) return fail('후보 기간을 확인해 주세요.');
        if (D.list(ps.value, pe.value).length > 93) return fail('후보 기간은 최대 93일까지예요.');
        pollBtn.disabled = true;
        try {
          await B.updateEvent(ev.id, { date_mode: 'poll', start_date: ps.value, end_date: pe.value, confirmed_start: null, confirmed_end: null, closed: false, default_nights: Math.min(days - 1, 6) });
          notify(); U.route();
        } catch (e) { fail('저장하지 못했어요: ' + e.message); pollBtn.disabled = false; }
      };
      const clearBtn = ev.confirmed_start ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
        await B.updateEvent(ev.id, { date_mode: 'undecided', confirmed_start: null, confirmed_end: null, trip_days: days }); notify(); U.route();
      } }, '날짜 미정으로 되돌리기') : null;
      return h('div', { style: 'display:grid;gap:16px' },
        h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '날짜 바로 정하기' }),
          h('div', { class: 'grid2' }, h('label', { class: 'f' }, '출발일', st), h('label', { class: 'f' }, '며칠 동안', nd)),
          h('div', { class: 'row' }, confirmBtn, clearBtn)),
        h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '멤버들에게 되는 날 받기' }),
          h('div', { class: 'grid2' }, h('label', { class: 'f' }, '후보 시작일', ps), h('label', { class: 'f' }, '후보 종료일', pe)),
          h('div', { class: 'row' }, pollBtn)),
        err);
    }

    // ═══════════════ 일정표 ═══════════════
    async function tabPlan() {
      const SEG_COLORS = { green: '초록', blue: '파랑', amber: '노랑', red: '빨강', purple: '보라', teal: '청록' };
      const SEG_VAR = { green: 'var(--ok)', blue: 'var(--accent)', amber: 'var(--maybe)', red: 'var(--no)', purple: '#7c5cd6', teal: '#1a9aa6' };
      const totalBox = h('div', { class: 'row', style: 'justify-content:space-between' });
      const segBox = h('div', { class: 'seg-editor' });
      const grid = h('div', { class: 'plan-grid' });
      const ideaBox = h('div');
      const copyBtn = h('button', { class: 'btn small', type: 'button' }, '일정표 텍스트 복사');
      const copyFb = h('textarea', { class: 'copybox', readonly: true, hidden: true, 'aria-label': '복사할 일정표' });
      mount(
        h('div', { class: 'panel' }, totalBox,
          h('p', { class: 'hint', text: '장소를 적으면 구글·네이버·카카오 지도로 바로 열 수 있어요. 하루에 장소가 두 곳 이상이면 "하루 동선 보기"로 순서대로 길찾기를 열어요.' })),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', { text: '여행 뼈대' }), h('span', { class: 'hint', text: '예: 1~3일차 서울, 3~5일차 부산' })),
          h('p', { class: 'hint', text: '먼저 어느 날 어디에 있을지 구간을 함께 정하면, 아래 일정표가 구간별 색으로 묶여 보여요. 이동하는 날은 두 구간에 겹쳐 넣으면 돼요.' }),
          segBox),
        grid, ideaBox, h('div', { class: 'row', style: 'justify-content:flex-end' }, copyBtn), copyFb);
      let items = [], segs = [];
      const openForms = new Set();
      let segFormOpen = false;
      async function load() {
        try { [items, segs] = await Promise.all([B.list('plan_items', ev.id), B.list('plan_segments', ev.id)]); }
        catch (e) { grid.replaceChildren(h('div', { class: 'banner err', text: '일정표를 불러오지 못했어요.' })); return; }
        if (!stale()) render();
      }
      refresh = () => { if (!openForms.size && !segFormOpen) load(); };
      const sorted = arr => arr.slice().sort((a, b) => ((a.start_time || '99') > (b.start_time || '99') ? 1 : (a.start_time || '99') < (b.start_time || '99') ? -1 : a.sort - b.sort));
      const segRange = sg => sg.start_day === sg.end_day ? `${sg.start_day + 1}일차` : `${sg.start_day + 1}~${sg.end_day + 1}일차`;
      const segDates = sg => (ev.confirmed_start ? ' · ' + (sg.start_day === sg.end_day ? D.short(dayDate(sg.start_day)) : `${D.short(dayDate(sg.start_day))}~${D.short(dayDate(sg.end_day))}`) : '');
      const visSegs = () => segs.filter(sg => sg.start_day < days).map(sg => ({ ...sg, end_day: Math.min(sg.end_day, days - 1) }))
        .sort((a, b) => a.start_day - b.start_day || a.end_day - b.end_day || a.sort - b.sort);
      function render() {
        const total = items.reduce((s, x) => s + (x.cost || 0), 0);
        const done = items.filter(x => x.done).length;
        totalBox.replaceChildren(
          h('div', {}, h('div', { class: 'eyebrow', text: '일정표' }), h('h2', { text: `${D.nightsLabel(days)} · 일정 ${items.length}개` })),
          h('div', { class: 'stats' },
            h('span', {}, '예상 비용 ', h('b', { text: won(total) })),
            members.length > 1 ? h('span', {}, '1인당 ', h('b', { text: won(Math.round(total / members.length)) })) : null,
            h('span', {}, '완료 ', h('b', { text: `${done}/${items.length}` }))));
        renderSegEditor();
        // 일차 + 구간 띠
        const vs = visSegs();
        const startsAt = new Set(vs.map(sg => sg.start_day));
        const kids = [];
        vs.forEach((sg, k) => {
          // 같은 날 시작하는 구간이 여럿이면 이름표를 옆으로 비켜 놓음
          const sameStartBefore = vs.slice(0, k).filter(x => x.start_day === sg.start_day).length;
          // 앞 구간과 겹치는 이동일: 앞 구간 색에서 이 구간 색으로 자연스럽게 넘어가게
          const prev = vs.slice(0, k).reverse().find(x => x.start_day < sg.start_day && x.end_day >= sg.start_day);
          const bandStyle = `grid-row:${sg.start_day + 1} / ${sg.end_day + 2}` + (prev ? `;--sc-prev:${SEG_VAR[prev.color]}` : '');
          kids.push(h('div', { class: `seg-band seg-${sg.color}` + (prev ? ' after' : ''), style: bandStyle },
            h('span', { class: 'seg-label', style: sameStartBefore ? `left:${12 + sameStartBefore * 140}px` : null },
              h('i', { class: 'seg-dot' }), h('b', { text: sg.name }), h('span', { text: segRange(sg) + segDates(sg) }))));
        });
        for (let i = 0; i < days; i++) {
          const here = vs.filter(sg => sg.start_day <= i && sg.end_day >= i);
          const sec = daySection(i, sorted(items.filter(x => x.day_index === i)), here);
          sec.style.gridRow = String(i + 1);
          if (startsAt.has(i)) sec.classList.add('seg-start');
          if (here.length) sec.classList.add('in-seg');
          kids.push(sec);
        }
        grid.replaceChildren(...kids);
        ideaBox.replaceChildren(daySection(null, sorted(items.filter(x => x.day_index == null || x.day_index >= days)), []));
      }
      function renderSegEditor() {
        const chips = segs.slice().sort((a, b) => a.start_day - b.start_day).map(sg => {
          const canDel = isOwner || sg.created_by === me.id;
          return h('div', { class: `seg-chip seg-${sg.color}` + (sg.start_day >= days ? ' out' : '') },
            h('i', { class: 'seg-dot' }), h('b', { text: sg.name }), h('span', { text: segRange(sg) + segDates(sg) }),
            h('button', { type: 'button', class: 'btn small ghost', onclick: () => openSegForm(sg) }, '수정'),
            canDel ? h('button', { type: 'button', class: 'btn small ghost', 'aria-label': `${sg.name} 구간 삭제`, onclick: async () => {
              try { await B.remove('plan_segments', sg.id); segs = segs.filter(x => x.id !== sg.id); notify(); render(); } catch {}
            } }, '✕') : null);
        });
        segBox.replaceChildren(
          h('div', { class: 'seg-chips' }, chips.length ? chips : h('span', { class: 'hint', text: '아직 구간이 없어요.' })),
          h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => openSegForm(null) }, '+ 구간 추가')));
      }
      function openSegForm(sg) {
        segFormOpen = true;
        const used = new Set(segs.map(x => x.color));
        let color = sg ? sg.color : (Object.keys(SEG_COLORS).find(c => !used.has(c)) || 'green');
        const lastEnd = segs.reduce((m, x) => Math.max(m, x.end_day), -1);
        const nm = h('input', { type: 'text', maxlength: '20', placeholder: '예: 서울, 부산, 제주 동쪽', value: sg ? sg.name : '' });
        const opt = sel => [...Array(days).keys()].map(d => { const o = h('option', { value: String(d), text: dayLabel(d) }); if (d === sel) o.selected = true; return o; });
        const from = h('select', {}, opt(sg ? Math.min(sg.start_day, days - 1) : Math.max(0, Math.min(lastEnd, days - 1))));
        const to = h('select', {}, opt(sg ? Math.min(sg.end_day, days - 1) : Math.min(days - 1, Math.max(0, lastEnd) + 2)));
        const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': '구간 색' });
        const drawSw = () => sw.replaceChildren(...Object.entries(SEG_COLORS).map(([k, v]) => h('button', {
          type: 'button', role: 'radio', class: `swatch seg-${k}`, 'aria-checked': String(color === k), 'aria-label': v, title: v,
          onclick: () => { color = k; drawSw(); }
        })));
        drawSw();
        const err = h('p', { class: 'err-text', hidden: true });
        const save = h('button', { class: 'btn primary small', type: 'submit' }, sg ? '저장' : '추가');
        const close = () => { segFormOpen = false; render(); };
        const f = h('form', { class: 'item-form', novalidate: true },
          h('div', { class: 'grid-form' },
            h('label', { class: 'f wide' }, '구간 이름', nm),
            h('label', { class: 'f' }, '시작', from),
            h('label', { class: 'f' }, '끝', to)),
          h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '색' }), sw),
          err, h('div', { class: 'row' }, save, h('button', { class: 'btn small ghost', type: 'button', onclick: close }, '취소')));
        f.addEventListener('submit', async e => {
          e.preventDefault(); err.hidden = true;
          const name = nm.value.trim();
          const sd = parseInt(from.value, 10), ed = parseInt(to.value, 10);
          if (!name) { err.textContent = '구간 이름을 적어 주세요.'; err.hidden = false; return; }
          if (ed < sd) { err.textContent = '끝나는 날이 시작하는 날보다 빨라요.'; err.hidden = false; return; }
          save.disabled = true;
          try {
            const row = { name, start_day: sd, end_day: ed, color };
            if (sg) Object.assign(sg, await B.update('plan_segments', sg.id, row));
            else segs.push(await B.insert('plan_segments', { ...row, event_id: ev.id, sort: Date.now() }));
            notify(); close();
          } catch (ex) { err.textContent = '저장하지 못했어요: ' + ex.message; err.hidden = false; save.disabled = false; }
        });
        segBox.replaceChildren(f);
        setTimeout(() => nm.focus(), 0);
      }
      function daySection(i, arr, here) {
        const places = arr.map(x => x.place).filter(Boolean);
        const cost = arr.reduce((s, x) => s + (x.cost || 0), 0);
        const addBox = h('div');
        const addBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { addBox.replaceChildren(itemForm(null, i, addBox)); addBtn.hidden = true; } }, '+ 일정 추가');
        addBox.addEventListener('formclosed', () => { addBtn.hidden = false; });
        const tags = here.length ? h('span', { class: 'day-segs' }, here.flatMap((sg, k) => [k ? h('span', { class: 'arrow', text: '→' }) : null, h('span', { class: `seg-tag seg-${sg.color}`, text: sg.name })])) : null;
        return h('section', { class: 'panel day-sec' + (i == null ? ' idea' : '') },
          h('div', { class: 'panel-head' },
            h('div', { class: 'row', style: 'gap:8px' }, h('h3', { text: i == null ? '아이디어 보관함' : dayLabel(i) }), tags),
            h('span', { class: 'hint', text: i == null ? '날짜를 정하지 않은 후보들' : (cost ? won(cost) : '') })),
          arr.length ? h('ol', { class: 'items' }, arr.map(itemRow)) : h('p', { class: 'hint', text: i == null ? '가 보고 싶은 곳, 먹고 싶은 것을 적어 두세요.' : '아직 일정이 없어요.' }),
          h('div', { class: 'row' }, addBtn,
            places.length >= 2 ? h('a', { class: 'btn small ghost', href: routeUrl(places.slice(0, 10)), target: '_blank', rel: 'noopener noreferrer' }, '하루 동선 보기') : null),
          addBox);
      }
      function itemRow(x) {
        const row = h('li', { class: 'item' + (x.done ? ' done' : '') });
        const cb = h('input', { type: 'checkbox', class: 'req', 'aria-label': '완료 표시' }); cb.checked = x.done;
        cb.onchange = async () => { try { await B.update('plan_items', x.id, { done: cb.checked }); x.done = cb.checked; notify(); render(); } catch { cb.checked = !cb.checked; } };
        const canDel = isOwner || x.created_by === me.id;
        let armed = false;
        const del = canDel ? h('button', { class: 'btn small ghost danger', type: 'button' }, '삭제') : null;
        if (del) del.onclick = async () => {
          if (!armed) { armed = true; del.textContent = '정말 삭제?'; setTimeout(() => { armed = false; del.textContent = '삭제'; }, 3000); return; }
          try { await B.remove('plan_items', x.id); items = items.filter(y => y.id !== x.id); notify(); render(); } catch (e) { del.textContent = '삭제 실패'; }
        };
        const move = h('select', { class: 'mini', 'aria-label': '다른 날로 옮기기' },
          h('option', { value: '', text: '옮기기…' }),
          [...Array(days).keys()].map(d => h('option', { value: String(d), text: `${d + 1}일차` })),
          h('option', { value: 'idea', text: '보관함' }));
        move.onchange = async () => {
          if (!move.value) return;
          const di = move.value === 'idea' ? null : parseInt(move.value, 10);
          try { const u = await B.update('plan_items', x.id, { day_index: di }); Object.assign(x, u); notify(); render(); } catch { move.value = ''; }
        };
        const editBox = h('div');
        const edit = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { editBox.replaceChildren(itemForm(x, x.day_index, editBox)); } }, '수정');
        const link = safeUrl(x.link);
        row.append(
          h('div', { class: 'item-main' }, cb,
            h('div', { class: 'item-body' },
              h('div', { class: 'item-title' },
                x.start_time ? h('span', { class: 'time', text: x.start_time.slice(0, 5) }) : null,
                h('span', { class: 'cat cat-' + x.category, text: CATS[x.category] || '기타' }),
                h('b', { text: x.title })),
              x.place ? h('div', { class: 'item-place' }, h('span', { text: x.place }), ' ',
                mapLinks(x.place).map(([n, u]) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: 'maplink' }, n))) : null,
              (x.cost || x.memo || link) ? h('div', { class: 'item-meta' },
                x.cost ? h('span', { text: won(x.cost) }) : null,
                x.memo ? h('span', { class: 'memo', text: x.memo }) : null,
                link ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer nofollow' }, '링크') : null) : null),
            h('div', { class: 'item-actions' }, edit, move, del)),
          editBox);
        return row;
      }
      function itemForm(x, dayIdx, holder) {
        const ttl = h('input', { type: 'text', maxlength: '80', placeholder: '예: 성산일출봉 올라가기', value: x ? x.title : '' });
        const tm = h('input', { type: 'time', value: x && x.start_time ? x.start_time.slice(0, 5) : '' });
        const cat = h('select', {}, Object.entries(CATS).map(([k, v]) => h('option', { value: k, text: v })));
        cat.value = x ? x.category : 'sight';
        const pl = h('input', { type: 'text', maxlength: '120', placeholder: '장소 (예: 성산일출봉, 서울역)', value: x ? x.place : '' });
        const cs = h('input', { type: 'number', min: '0', step: '1000', inputmode: 'numeric', placeholder: '0', value: x && x.cost ? String(x.cost) : '' });
        const mm = h('input', { type: 'text', maxlength: '500', placeholder: '메모 (예약 번호, 준비물 등)', value: x ? x.memo : '' });
        const lk = h('input', { type: 'url', maxlength: '500', placeholder: 'https:// 예약·참고 링크 (선택)', value: x ? x.link : '' });
        const err = h('p', { class: 'err-text', hidden: true });
        const save = h('button', { class: 'btn primary small', type: 'submit' }, x ? '저장' : '추가');
        const close = () => { openForms.delete(f); holder.replaceChildren(); holder.dispatchEvent(new Event('formclosed')); };
        const f = h('form', { class: 'item-form', novalidate: true },
          h('div', { class: 'grid-form' },
            h('label', { class: 'f wide' }, '할 일', ttl),
            h('label', { class: 'f' }, '시간', tm),
            h('label', { class: 'f' }, '종류', cat),
            h('label', { class: 'f wide' }, '장소', pl),
            h('label', { class: 'f' }, '비용(원)', cs),
            h('label', { class: 'f wide' }, '메모', mm),
            h('label', { class: 'f wide' }, '링크', lk)),
          err, h('div', { class: 'row' }, save, h('button', { class: 'btn small ghost', type: 'button', onclick: close }, '취소')));
        openForms.add(f);
        f.addEventListener('submit', async e => {
          e.preventDefault(); err.hidden = true;
          const title = ttl.value.trim();
          if (!title) { err.textContent = '할 일을 적어 주세요.'; err.hidden = false; return; }
          const link = lk.value.trim();
          if (link && !safeUrl(link)) { err.textContent = '링크는 http:// 또는 https:// 로 시작해야 해요.'; err.hidden = false; return; }
          const cost = Math.max(0, Math.min(100000000, parseInt(cs.value || '0', 10) || 0));
          const row = { title, start_time: tm.value || null, category: cat.value, place: pl.value.trim(), cost, memo: mm.value.trim(), link };
          save.disabled = true;
          try {
            if (x) Object.assign(x, await B.update('plan_items', x.id, row));
            else items.push(await B.insert('plan_items', { ...row, event_id: ev.id, day_index: dayIdx, sort: Date.now() }));
            notify(); openForms.delete(f); render();
          } catch (ex) { err.textContent = '저장하지 못했어요: ' + ex.message; err.hidden = false; save.disabled = false; }
        });
        setTimeout(() => ttl.focus(), 0);
        return f;
      }
      copyBtn.onclick = () => {
        const lines = [`[${ev.title}] 일정표 (${D.tripSummary(ev).label})`];
        const vs = visSegs();
        for (let i = 0; i < days; i++) {
          vs.filter(sg => sg.start_day === i).forEach(sg => lines.push('', `◆ ${sg.name} (${segRange(sg)}${segDates(sg)})`));
          const arr = sorted(items.filter(x => x.day_index === i)); if (!arr.length) continue;
          lines.push('', `■ ${dayLabel(i)}`);
          arr.forEach(x => lines.push(`- ${x.start_time ? x.start_time.slice(0, 5) + ' ' : ''}${x.title}${x.place ? ' @' + x.place : ''}${x.cost ? ' (' + won(x.cost) + ')' : ''}`));
        }
        lines.push('', `예상 비용 합계: ${won(items.reduce((s, x) => s + (x.cost || 0), 0))}`, shareUrl(code));
        copyText(lines.join('\n'), copyBtn, copyFb);
      };
      grid.replaceChildren(h('div', { class: 'empty', text: '일정표를 불러오는 중…' }));
      load();
    }

    // ═══════════════ 준비물 ═══════════════
    async function tabCheck() {
      const txt = h('input', { type: 'text', maxlength: '100', placeholder: '예: 보조배터리, 우산, 숙소 예약 확인' });
      const who = h('select', { 'aria-label': '담당' }, h('option', { value: '', text: '다 같이' }), members.map(m => h('option', { value: m.user_id, text: m.display_name })));
      const add = h('button', { class: 'btn primary small', type: 'submit' }, '추가');
      const basics = h('button', { class: 'btn small ghost', type: 'button' }, '기본 준비물 넣기');
      const progress = h('div', { class: 'progress' });
      const list = h('div', { style: 'display:grid;gap:12px' });
      const form = h('form', { class: 'row', novalidate: true }, h('div', { style: 'flex:1;min-width:180px' }, txt), who, add);
      mount(h('section', { class: 'panel' }, h('h2', { text: '준비물 · 할 일' }), progress, form, h('div', { class: 'row' }, basics), list));
      let rows = [];
      async function load() { try { rows = await B.list('checklist_items', ev.id); if (!stale()) render(); } catch { list.replaceChildren(h('div', { class: 'banner err', text: '목록을 불러오지 못했어요.' })); } }
      refresh = load;
      function render() {
        const done = rows.filter(r => r.done).length;
        progress.replaceChildren(h('div', { class: 'bar-lg' }, h('i', { style: `width:${rows.length ? (done / rows.length) * 100 : 0}%` })),
          h('span', { class: 'hint', text: rows.length ? `${done}/${rows.length} 완료` : '아직 항목이 없어요.' }));
        const sortRows = arr => arr.slice().sort((a, b) => a.sort - b.sort);
        const group = (title, arr) => arr.length ? h('div', {}, h('div', { class: 'eyebrow', text: title }), h('ul', { class: 'checks' }, sortRows(arr).map(rowEl))) : null;
        const byMe = rows.filter(r => !r.done && r.assignee === me.id);
        const others = rows.filter(r => !r.done && r.assignee !== me.id);
        list.replaceChildren(...[group('내 담당', byMe), group('할 일', others), group('완료', rows.filter(r => r.done))].filter(Boolean));
      }
      function rowEl(r) {
        const cb = h('input', { type: 'checkbox', class: 'req', 'aria-label': r.text }); cb.checked = r.done;
        cb.onchange = async () => { try { Object.assign(r, await B.update('checklist_items', r.id, { done: cb.checked })); notify(); render(); } catch { cb.checked = !cb.checked; } };
        const sel = h('select', { class: 'mini', 'aria-label': '담당 바꾸기' }, h('option', { value: '', text: '다 같이' }), members.map(m => h('option', { value: m.user_id, text: m.display_name })));
        sel.value = r.assignee || '';
        sel.onchange = async () => { try { Object.assign(r, await B.update('checklist_items', r.id, { assignee: sel.value || null })); notify(); render(); } catch {} };
        const canDel = isOwner || r.created_by === me.id;
        return h('li', { class: r.done ? 'done' : '' }, h('label', {}, cb, h('span', { text: r.text })), sel,
          canDel ? h('button', { class: 'btn small ghost', type: 'button', 'aria-label': '삭제', onclick: async () => { try { await B.remove('checklist_items', r.id); rows = rows.filter(y => y.id !== r.id); notify(); render(); } catch {} } }, '✕') : null);
      }
      form.addEventListener('submit', async e => {
        e.preventDefault(); const t = txt.value.trim(); if (!t) return;
        add.disabled = true;
        try { rows.push(await B.insert('checklist_items', { event_id: ev.id, text: t, assignee: who.value || null, sort: Date.now() })); txt.value = ''; notify(); render(); }
        catch (ex) { alertBox(list, '추가하지 못했어요: ' + ex.message); }
        finally { add.disabled = false; txt.focus(); }
      });
      basics.onclick = async () => {
        basics.disabled = true;
        const have = new Set(rows.map(r => r.text));
        for (const t of ['신분증', '충전기·보조배터리', '세면도구', '상비약', '여벌 옷', '숙소 예약 확인', '교통편 예매'].filter(t => !have.has(t))) {
          try { rows.push(await B.insert('checklist_items', { event_id: ev.id, text: t, sort: Date.now() + rows.length })); } catch {}
        }
        notify(); render(); basics.disabled = false;
      };
      list.replaceChildren(h('div', { class: 'empty', text: '불러오는 중…' }));
      load();
    }

    // ═══════════════ 정산 ═══════════════
    async function tabMoney() {
      const summary = h('div', { style: 'display:grid;gap:12px' });
      const list = h('div');
      const copyBtn = h('button', { class: 'btn small', type: 'button' }, '정산 결과 복사');
      const copyFb = h('textarea', { class: 'copybox', readonly: true, hidden: true, 'aria-label': '복사할 정산 결과' });
      const formBox = h('div');
      mount(
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', { text: '누가 누구에게 얼마?' }), copyBtn), summary, copyFb,
          h('p', { class: 'hint', text: '정산 결과는 계산을 도와주는 참고용이에요. 실제 송금은 각자 은행 앱으로 해 주세요.' })),
        h('section', { class: 'panel' }, h('h2', { text: '쓴 돈 기록' }), formBox, list));
      let rows = [];
      const shareOf = (r) => { // 나머지 원은 앞사람부터 1원씩
        const n = r.split.length, base = Math.floor(r.amount / n), rem = r.amount - base * n;
        const out = {}; r.split.forEach((u, i) => { out[u] = base + (i < rem ? 1 : 0); }); return out;
      };
      async function load() { try { rows = await B.list('expenses', ev.id); if (!stale()) render(); } catch { list.replaceChildren(h('div', { class: 'banner err', text: '정산 내역을 불러오지 못했어요.' })); } }
      refresh = load;
      function settle() {
        const bal = {}; members.forEach(m => { bal[m.user_id] = { paid: 0, owe: 0 }; });
        for (const r of rows) {
          (bal[r.paid_by] = bal[r.paid_by] || { paid: 0, owe: 0 }).paid += r.amount;
          for (const [u, v] of Object.entries(shareOf(r))) (bal[u] = bal[u] || { paid: 0, owe: 0 }).owe += v;
        }
        const net = Object.entries(bal).map(([u, b]) => ({ u, v: b.paid - b.owe, ...b }));
        const cred = net.filter(x => x.v > 0).sort((a, b) => b.v - a.v).map(x => ({ ...x }));
        const debt = net.filter(x => x.v < 0).sort((a, b) => a.v - b.v).map(x => ({ ...x, v: -x.v }));
        const tx = [];
        let i = 0, j = 0;
        while (i < debt.length && j < cred.length) {
          const amt = Math.min(debt[i].v, cred[j].v);
          if (amt > 0) tx.push({ from: debt[i].u, to: cred[j].u, amt });
          debt[i].v -= amt; cred[j].v -= amt;
          if (debt[i].v === 0) i++; if (cred[j].v === 0) j++;
        }
        return { net, tx };
      }
      function render() {
        const total = rows.reduce((s, r) => s + r.amount, 0);
        const { net, tx } = settle();
        summary.replaceChildren(
          h('div', { class: 'stats' }, h('span', {}, '총 지출 ', h('b', { text: won(total) })), h('span', {}, '기록 ', h('b', { text: rows.length + '건' }))),
          tx.length ? h('ul', { class: 'tx' }, tx.map(t => h('li', { class: t.from === me.id ? 'mine' : t.to === me.id ? 'tome' : '' },
            h('b', { text: memberName(t.from) }), ' → ', h('b', { text: memberName(t.to) }), h('span', { class: 'amt', text: won(t.amt) }))))
            : h('p', { class: 'hint', text: rows.length ? '보낼 돈이 없어요. 정산 끝!' : '쓴 돈을 기록하면 누가 누구에게 보낼지 계산해 드려요.' }),
          rows.length ? h('div', { class: 'matrix-wrap' }, h('table', { class: 'money' },
            h('thead', {}, h('tr', {}, ['멤버', '낸 돈', '부담할 돈', '차액'].map(t => h('th', { text: t })))),
            h('tbody', {}, net.filter(x => x.paid || x.owe).map(x => h('tr', {},
              h('td', { text: memberName(x.u) + (x.u === me.id ? ' (나)' : '') }), h('td', { text: won(x.paid) }), h('td', { text: won(x.owe) }),
              h('td', { class: x.v > 0 ? 'pos' : x.v < 0 ? 'neg' : '', text: (x.v > 0 ? '+' : '') + won(x.v) })))))) : null);
        list.replaceChildren(rows.length ? h('ul', { class: 'exp' }, rows.slice().sort((a, b) => (b.spent_on || '').localeCompare(a.spent_on || '') || b.created_at.localeCompare(a.created_at)).map(expRow)) : h('p', { class: 'hint', text: '아직 기록이 없어요.' }));
        copyBtn.onclick = () => {
          const lines = [`[${ev.title}] 정산 · 총 ${won(total)}`];
          tx.forEach(t => lines.push(`${memberName(t.from)} → ${memberName(t.to)}: ${won(t.amt)}`));
          if (!tx.length) lines.push('보낼 돈이 없어요.');
          copyText(lines.join('\n'), copyBtn, copyFb);
        };
      }
      function expRow(r) {
        const canEdit = isOwner || r.created_by === me.id || r.paid_by === me.id;
        let armed = false;
        const del = canEdit ? h('button', { class: 'btn small ghost danger', type: 'button' }, '삭제') : null;
        if (del) del.onclick = async () => {
          if (!armed) { armed = true; del.textContent = '정말 삭제?'; setTimeout(() => { armed = false; del.textContent = '삭제'; }, 3000); return; }
          try { await B.remove('expenses', r.id); rows = rows.filter(x => x.id !== r.id); notify(); render(); } catch { del.textContent = '삭제 실패'; }
        };
        return h('li', {},
          h('div', { class: 'exp-main' }, h('b', { text: r.title }), h('span', { class: 'amt', text: won(r.amount) })),
          h('div', { class: 'hint' }, `${memberName(r.paid_by)} 냄 · ${r.split.length}명이 나눔 (${r.split.map(memberName).join(', ')})`, r.spent_on ? ' · ' + D.short(r.spent_on) : '', r.memo ? ' · ' + r.memo : ''),
          del ? h('div', { class: 'row', style: 'justify-content:flex-end' }, del) : null);
      }
      // 입력 폼
      const ttl = h('input', { type: 'text', maxlength: '60', placeholder: '예: 숙소, 저녁 회, 렌터카' });
      const amt = h('input', { type: 'number', min: '1', step: '100', inputmode: 'numeric', placeholder: '금액' });
      const payer = h('select', { 'aria-label': '낸 사람' }, members.map(m => h('option', { value: m.user_id, text: m.display_name })));
      payer.value = me.id;
      const when = h('input', { type: 'date', value: ev.confirmed_start && D.today() >= ev.confirmed_start && D.today() <= ev.confirmed_end ? D.today() : '' });
      const memo = h('input', { type: 'text', maxlength: '200', placeholder: '메모 (선택)' });
      const splitSel = new Set(members.map(m => m.user_id));
      const chips = h('div', { class: 'who' });
      const drawChips = () => chips.replaceChildren(...members.map(m => h('button', {
        type: 'button', class: 'chip toggle', 'aria-pressed': String(splitSel.has(m.user_id)),
        onclick: () => { splitSel.has(m.user_id) ? splitSel.delete(m.user_id) : splitSel.add(m.user_id); drawChips(); }
      }, m.display_name)));
      drawChips();
      const err = h('p', { class: 'err-text', hidden: true });
      const save = h('button', { class: 'btn primary small', type: 'submit' }, '기록하기');
      const f = h('form', { class: 'item-form', novalidate: true },
        h('div', { class: 'grid-form' },
          h('label', { class: 'f wide' }, '어디에 썼나요', ttl), h('label', { class: 'f' }, '금액(원)', amt),
          h('label', { class: 'f' }, '낸 사람', payer), h('label', { class: 'f' }, '날짜', when), h('label', { class: 'f wide' }, '메모', memo)),
        h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '나눌 사람' }), chips,
          h('div', { class: 'row' },
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => { members.forEach(m => splitSel.add(m.user_id)); drawChips(); } }, '모두'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => { splitSel.clear(); drawChips(); } }, '모두 빼기'))),
        err, h('div', {}, save));
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.hidden = true;
        const a = parseInt(amt.value, 10);
        if (!ttl.value.trim()) { err.textContent = '어디에 썼는지 적어 주세요.'; err.hidden = false; return; }
        if (!(a >= 1 && a <= 100000000)) { err.textContent = '금액을 1원~1억 원 사이로 적어 주세요.'; err.hidden = false; return; }
        if (!splitSel.size) { err.textContent = '나눌 사람을 한 명 이상 골라 주세요.'; err.hidden = false; return; }
        save.disabled = true;
        try {
          rows.push(await B.insert('expenses', { event_id: ev.id, title: ttl.value.trim(), amount: a, paid_by: payer.value, split: [...splitSel], spent_on: when.value || null, memo: memo.value.trim() }));
          ttl.value = ''; amt.value = ''; memo.value = ''; notify(); render();
        } catch (ex) { err.textContent = '기록하지 못했어요: ' + ex.message; err.hidden = false; }
        finally { save.disabled = false; }
      });
      formBox.append(f);
      list.replaceChildren(h('div', { class: 'empty', text: '불러오는 중…' }));
      load();
    }

    // ═══════════════ 다이어리 ═══════════════
    async function tabDiary() {
      const list = h('div', { style: 'display:grid;gap:16px' });
      const composeBox = h('div');
      mount(composeBox, list);
      let rows = [];
      let urls = {};
      let editing = false;
      async function load() {
        try {
          rows = await B.list('diary_entries', ev.id);
          const paths = rows.flatMap(r => r.photos || []);
          urls = paths.length ? await B.photoUrls(paths) : {};
          if (!stale()) render();
        } catch (e) { list.replaceChildren(h('div', { class: 'banner err', text: '다이어리를 불러오지 못했어요.' })); }
      }
      refresh = () => { if (!editing) load(); };
      function render() {
        if (!rows.length) { list.replaceChildren(h('div', { class: 'empty', text: '첫 기록을 남겨 보세요. 사진은 한 번에 6장까지 올릴 수 있어요.' })); return; }
        const sortedRows = rows.slice().sort((a, b) => (b.entry_date || '').localeCompare(a.entry_date || '') || b.created_at.localeCompare(a.created_at));
        list.replaceChildren(...sortedRows.map(entryEl));
      }
      function entryEl(r) {
        const mine = r.author_id === me.id;
        let armed = false;
        const del = (mine || isOwner) ? h('button', { class: 'btn small ghost danger', type: 'button' }, '삭제') : null;
        if (del) del.onclick = async () => {
          if (!armed) { armed = true; del.textContent = '정말 삭제?'; setTimeout(() => { armed = false; del.textContent = '삭제'; }, 3000); return; }
          try { await B.deletePhotos(r.photos || []).catch(() => {}); await B.remove('diary_entries', r.id); rows = rows.filter(x => x.id !== r.id); notify(); render(); } catch { del.textContent = '삭제 실패'; }
        };
        const edit = mine ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { composeBox.replaceChildren(composer(r)); composeBox.scrollIntoView({ behavior: 'smooth' }); } }, '수정') : null;
        return h('article', { class: 'panel diary' },
          h('div', { class: 'panel-head' },
            h('div', {}, h('div', { class: 'eyebrow', text: (r.entry_date ? D.long(r.entry_date) : '날짜 없음') + ' · ' + memberName(r.author_id) }),
              r.title ? h('h3', { text: r.title }) : null),
            r.mood ? h('span', { class: 'badge mood-' + r.mood, text: MOODS[r.mood] }) : null),
          r.body ? h('p', { class: 'diary-body', text: r.body }) : null,
          (r.photos || []).length ? h('div', { class: 'photos' }, r.photos.map(p => urls[p] ? h('button', { type: 'button', class: 'ph', onclick: () => lightbox(urls[p]) }, h('img', { src: urls[p], alt: '여행 사진', loading: 'lazy' })) : h('div', { class: 'ph missing', text: '사진 없음' }))) : null,
          (edit || del) ? h('div', { class: 'row', style: 'justify-content:flex-end' }, edit, del) : null);
      }
      function composer(r) {
        editing = !!r;
        const dt = h('input', { type: 'date', value: r ? (r.entry_date || '') : (ev.confirmed_start && D.today() >= ev.confirmed_start && D.today() <= ev.confirmed_end ? D.today() : D.today()) });
        const ttl = h('input', { type: 'text', maxlength: '60', placeholder: '제목 (선택)', value: r ? r.title : '' });
        const bd = h('textarea', { rows: '4', maxlength: '5000', placeholder: '오늘 어땠나요? 기억하고 싶은 순간을 적어 보세요.', value: r ? r.body : '' });
        let mood = r ? r.mood : '';
        const moodBox = h('div', { class: 'who' });
        const drawMood = () => moodBox.replaceChildren(...Object.entries(MOODS).map(([k, v]) => h('button', { type: 'button', class: 'chip toggle', 'aria-pressed': String(mood === k), onclick: () => { mood = mood === k ? '' : k; drawMood(); } }, v)));
        drawMood();
        let keep = r ? (r.photos || []).slice() : [];
        let files = [];
        const preview = h('div', { class: 'photos small' });
        const drawPreview = () => preview.replaceChildren(
          ...keep.map(p => h('div', { class: 'ph' }, urls[p] ? h('img', { src: urls[p], alt: '' }) : null, h('button', { type: 'button', class: 'ph-x', 'aria-label': '사진 빼기', onclick: () => { keep = keep.filter(x => x !== p); drawPreview(); } }, '✕'))),
          ...files.map((f, i) => h('div', { class: 'ph' }, h('img', { src: f.url, alt: '' }), h('button', { type: 'button', class: 'ph-x', 'aria-label': '사진 빼기', onclick: () => { URL.revokeObjectURL(f.url); files.splice(i, 1); drawPreview(); } }, '✕'))));
        drawPreview();
        const fileIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/*', multiple: true, id: 'diary-files', class: 'sr' });
        const err = h('p', { class: 'err-text', hidden: true });
        fileIn.onchange = async () => {
          err.hidden = true;
          for (const file of [...fileIn.files]) {
            if (keep.length + files.length >= 6) { err.textContent = '사진은 한 글에 6장까지 올릴 수 있어요.'; err.hidden = false; break; }
            try { const blob = await shrinkPhoto(file); files.push({ blob, url: URL.createObjectURL(blob) }); }
            catch (ex) { err.textContent = ex.message; err.hidden = false; }
          }
          fileIn.value = ''; drawPreview();
        };
        const save = h('button', { class: 'btn primary small', type: 'submit' }, r ? '저장' : '기록 남기기');
        const f = h('form', { class: 'panel', novalidate: true },
          h('h2', { text: r ? '기록 고치기' : '여행 다이어리' }),
          h('div', { class: 'grid-form' }, h('label', { class: 'f' }, '날짜', dt), h('label', { class: 'f wide' }, '제목', ttl)),
          bd,
          h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '오늘의 기분' }), moodBox),
          h('div', { class: 'row' }, h('label', { class: 'btn small', for: 'diary-files' }, '사진 추가'), fileIn, h('span', { class: 'hint', text: '사진 속 위치 정보는 올릴 때 지워져요. 다른 사람이 나온 사진은 동의를 받고 올려 주세요.' })),
          preview, err,
          h('div', { class: 'row' }, save, r ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { editing = false; composeBox.replaceChildren(composer(null)); } }, '취소') : null));
        f.addEventListener('submit', async e => {
          e.preventDefault(); err.hidden = true;
          if (!bd.value.trim() && !ttl.value.trim() && !keep.length && !files.length) { err.textContent = '내용이나 사진을 넣어 주세요.'; err.hidden = false; return; }
          save.disabled = true; save.textContent = files.length ? '사진 올리는 중…' : '저장 중…';
          const uploaded = [];
          try {
            for (const fl of files) uploaded.push(await B.uploadPhoto(ev.id, fl.blob));
            const row = { entry_date: dt.value || null, title: ttl.value.trim(), body: bd.value.trim(), mood, photos: [...keep, ...uploaded] };
            if (r) {
              const removed = (r.photos || []).filter(p => !keep.includes(p));
              Object.assign(r, await B.update('diary_entries', r.id, row));
              if (removed.length) B.deletePhotos(removed).catch(() => {});
            } else rows.push(await B.insert('diary_entries', { ...row, event_id: ev.id }));
            files.forEach(x => URL.revokeObjectURL(x.url));
            editing = false; notify();
            composeBox.replaceChildren(composer(null));
            await load();
          } catch (ex) {
            if (uploaded.length) B.deletePhotos(uploaded).catch(() => {});
            err.textContent = '저장하지 못했어요: ' + (ex.message || ex); err.hidden = false; save.disabled = false; save.textContent = r ? '저장' : '기록 남기기';
          }
        });
        return f;
      }
      function lightbox(src) {
        const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': '사진 크게 보기', onclick: () => box.remove() },
          h('img', { src, alt: '여행 사진' }), h('button', { type: 'button', class: 'btn small', onclick: () => box.remove() }, '닫기'));
        document.body.append(box);
        const onKey = e => { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
        addCleanup(() => box.remove());
      }
      composeBox.append(composer(null));
      list.replaceChildren(h('div', { class: 'empty', text: '불러오는 중…' }));
      load();
    }

    // ═══════════════ 멤버·설정 ═══════════════
    function tabPeople() {
      const meRow = members.find(m => m.user_id === me.id);
      const myName = h('input', { type: 'text', maxlength: '30', value: meRow ? meRow.display_name : me.name });
      const nameMsg = h('span', { class: 'hint' });
      const nameBtn = h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const n = myName.value.trim(); if (!n) return;
        try { await B.renameMember(ev.id, n); nameMsg.textContent = '바꿨어요'; notify(); } catch (e) { nameMsg.textContent = '바꾸지 못했어요'; }
      } }, '이름 바꾸기');
      const memberList = h('ul', { class: 'members' }, members.map(m => {
        let armed = false;
        const kick = isOwner && m.user_id !== me.id ? h('button', { class: 'btn small ghost danger', type: 'button' }, '내보내기') : null;
        if (kick) kick.onclick = async () => {
          if (!armed) { armed = true; kick.textContent = `${m.display_name}님을 내보낼까요?`; setTimeout(() => { armed = false; kick.textContent = '내보내기'; }, 3500); return; }
          try { await B.removeMember(ev.id, m.user_id); notify(); U.route(); } catch { kick.textContent = '실패'; }
        };
        return h('li', {}, h('span', { text: m.display_name + (m.user_id === me.id ? ' (나)' : '') }),
          m.role === 'owner' ? h('span', { class: 'badge host', text: '방장' }) : null, kick);
      }));
      const sections = [
        h('section', { class: 'panel' }, h('h2', { text: `멤버 ${members.length}명` }), memberList,
          h('div', { class: 'row' }, h('label', { class: 'f', style: 'flex:1;min-width:180px' }, '이 여행에서 내 이름', myName), h('div', { style: 'align-self:flex-end' }, nameBtn), nameMsg)),
      ];
      if (isOwner) sections.push(ownerSettings());
      else {
        let armed = false;
        const leave = h('button', { class: 'btn danger small', type: 'button' }, '여행에서 나가기');
        leave.onclick = async () => {
          if (!armed) { armed = true; leave.textContent = '정말 나갈까요? 내 날짜 응답도 지워져요'; setTimeout(() => { armed = false; leave.textContent = '여행에서 나가기'; }, 4000); return; }
          try { await B.leaveEvent(ev.id); go('#/'); } catch { leave.textContent = '나가지 못했어요'; }
        };
        sections.push(h('section', { class: 'panel' }, h('h2', { text: '나가기' }), h('p', { class: 'hint', text: '나가면 다시 초대 링크로 들어와야 해요. 내가 쓴 일정표·준비물·다이어리 글은 남아요.' }), h('div', {}, leave)));
      }
      mount(...sections);
    }
    function ownerSettings() {
      const t = h('input', { type: 'text', maxlength: '60', value: ev.title });
      const ds = h('textarea', { rows: '2', maxlength: '500', value: ev.description || '' });
      const nd = h('input', { type: 'number', min: '1', max: '60', value: String(days), style: 'max-width:100px', disabled: !!ev.confirmed_start });
      const msg = h('p', { class: 'hint' });
      const save = h('button', { class: 'btn primary small', type: 'button' }, '저장');
      save.onclick = async () => {
        const title = t.value.trim(); if (!title) { msg.textContent = '여행 이름을 적어 주세요.'; return; }
        const patch = { title, description: ds.value.trim() };
        if (!ev.confirmed_start) { const n = parseInt(nd.value, 10); if (n >= 1 && n <= 60) patch.trip_days = n; }
        save.disabled = true;
        try { await B.updateEvent(ev.id, patch); notify(); U.route(); } catch (e) { msg.textContent = '저장하지 못했어요: ' + e.message; save.disabled = false; }
      };
      let rArmed = false;
      const rotate = h('button', { class: 'btn small', type: 'button' }, '초대 링크 새로 만들기');
      rotate.onclick = async () => {
        if (!rArmed) { rArmed = true; rotate.textContent = '예전 링크는 더 이상 열리지 않아요. 계속할까요?'; setTimeout(() => { rArmed = false; rotate.textContent = '초대 링크 새로 만들기'; }, 4000); return; }
        try { const c = await B.rotateCode(ev.id); go(`#/e/${c}/people`); } catch { rotate.textContent = '실패했어요'; }
      };
      let dArmed = false;
      const del = h('button', { class: 'btn danger small', type: 'button' }, '여행 삭제');
      del.onclick = async () => {
        if (!dArmed) { dArmed = true; del.textContent = '모든 기록과 사진이 지워져요. 한 번 더 누르면 삭제'; setTimeout(() => { dArmed = false; del.textContent = '여행 삭제'; }, 4000); return; }
        del.disabled = true;
        try {
          const entries = await B.list('diary_entries', ev.id).catch(() => []);
          await B.deletePhotos(entries.flatMap(r => r.photos || [])).catch(() => {});
          await B.deleteEvent(ev.id); go('#/');
        } catch { del.disabled = false; del.textContent = '삭제하지 못했어요'; }
      };
      return h('section', { class: 'panel' }, h('h2', { text: '방장 설정' }),
        h('label', { class: 'f' }, '여행 이름', t), h('label', { class: 'f' }, '소개', ds),
        h('label', { class: 'f' }, ev.confirmed_start ? '여행 일수 (날짜가 확정돼서 날짜 탭에서 바꿔요)' : '여행 일수', nd),
        h('div', { class: 'row' }, save), msg,
        h('div', { class: 'ctrls' }, h('span', { class: 'eyebrow', text: '초대 링크' }),
          h('p', { class: 'hint', text: '링크가 원치 않는 곳에 퍼졌다면 새로 만드세요. 이미 참여한 멤버는 그대로 남고, 필요하면 위에서 내보낼 수 있어요.' }), h('div', {}, rotate)),
        h('div', { class: 'ctrls danger-zone' }, h('span', { class: 'eyebrow', text: '위험 구역' }), h('div', {}, del)));
    }
    function alertBox(where, text) { where.prepend(h('div', { class: 'banner err', text })); }
  }

  window.EBTrip = { view };
})();
