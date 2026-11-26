// 첫 화면 예시 애니메이션: 날짜 투표 → 일정표 → 정산 → 다이어리
// 모두 가짜 예시 데이터이며 화면에 "예시"라고 표시합니다.
(function () {
  const PEOPLE = [
    { n: '민지', c: '#2b56c9' }, { n: '준호', c: '#1d9a69' }, { n: '서연', c: '#d9534a' }, { n: '도윤', c: '#b7791f' },
  ];
  // 사람별 안 되는 날 (2027년 1월)
  const BUSY = { 0: [4, 5, 11, 22, 23], 1: [7, 8, 9, 14, 29], 2: [1, 2, 12, 19, 20, 26], 3: [3, 10, 18, 24, 30] };
  const SCENES = [
    { key: 'dates', step: '날짜', title: '안 되는 날만 콕콕', body: '친구들이 각자 안 되는 날만 누르면, 모두 되는 날을 찾아 추천해요. 방장이 "확정"을 누르면 끝.' },
    { key: 'plan', step: '일정표', title: '일정표를 같이 짜요', body: '일차별로 일정을 쌓고, 장소는 구글·네이버·카카오 지도로 바로 열어요. 하루 동선도 한 번에.' },
    { key: 'money', step: '정산', title: '정산은 자동으로', body: '누가 얼마 냈는지만 적으면, 송금 횟수가 가장 적게 "누가 누구에게 얼마"를 계산해요.' },
    { key: 'diary', step: '다이어리', title: '추억은 다이어리에', body: '사진과 글로 여행을 남기고 멤버끼리 함께 봐요. 사진 속 위치 정보는 올릴 때 지워져요.' },
  ];
  const DURATION = 6500;

  function mount(host) {
    const U = window.EBUI;
    const { h } = U;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let idx = 0, timer = null, playing = !reduce, startedAt = 0, remaining = DURATION, alive = true;
    const typeTimers = [];

    const stage = h('div', { class: 'dp-stage', 'aria-live': 'polite' });
    const capTitle = h('h3', { class: 'dp-title' });
    const capBody = h('p', { class: 'dp-body' });
    const steps = h('div', { class: 'dp-steps', role: 'tablist', 'aria-label': '예시 단계' });
    const playBtn = h('button', { class: 'dp-play', type: 'button' });
    host.classList.add('demo-player');
    host.replaceChildren(
      h('div', { class: 'dp-top' },
        h('span', { class: 'dp-badge', text: '예시 화면' }),
        h('span', { class: 'dp-note', text: '실제 데이터가 아닌 사용 예시예요' }),
        playBtn),
      h('div', { class: 'dp-frame' },
        h('div', { class: 'dp-bar' }, h('i'), h('i'), h('i'), h('span', { text: '제주도 여행 · 멤버 4명' })),
        stage),
      h('div', { class: 'dp-caption' }, capTitle, capBody),
      steps);

    function drawSteps() {
      steps.replaceChildren(...SCENES.map((s, i) => h('button', {
        type: 'button', role: 'tab', class: 'dp-step' + (i === idx ? ' on' : ''), 'aria-selected': String(i === idx),
        style: `--dur:${DURATION}ms`, onclick: () => { go(i, true); },
      }, h('span', { class: 'dp-num', text: i + 1 }), h('span', { text: s.step }), h('i', { class: 'dp-fill' + (i === idx && playing ? ' run' : i < idx ? ' full' : '') }))));
      playBtn.textContent = playing ? '일시정지' : '재생';
      playBtn.setAttribute('aria-label', playing ? '예시 일시정지' : '예시 재생');
    }
    playBtn.onclick = () => { playing = !playing; if (playing) schedule(DURATION); else clearTimeout(timer); drawSteps(); };

    const stagger = (el, i, base = 0, gap = 120) => { el.style.animationDelay = reduce ? '0ms' : `${base + i * gap}ms`; return el; };

    // ── 장면 1: 날짜 투표
    function sceneDates() {
      const counts = {};
      for (let d = 1; d <= 31; d++) counts[d] = PEOPLE.length - Object.values(BUSY).filter(arr => arr.includes(d)).length;
      const cal = h('div', { class: 'dp-cal' });
      ['일', '월', '화', '수', '목', '금', '토'].forEach((w, i) => cal.append(h('div', { class: 'dp-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), text: w })));
      for (let i = 0; i < 5; i++) cal.append(h('div'));
      let markN = 0;
      for (let d = 1; d <= 31; d++) {
        const wd = (5 + d - 1) % 7;
        const ratio = counts[d] / PEOPLE.length;
        const cell = h('div', { class: 'dp-day' + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '') + (d === 15 || d === 16 ? ' pick' : '') },
          h('span', { class: 'dn', text: d }));
        const heat = h('span', { class: 'dp-heat' }); heat.style.setProperty('--r', ratio);
        stagger(heat, 0, 2900, 0); cell.prepend(heat);
        PEOPLE.forEach((p, pi) => {
          if (BUSY[pi].includes(d)) {
            const m = h('span', { class: 'dp-x', text: '✕' }); m.style.color = p.c;
            stagger(m, markN++, 300, 90); cell.append(m);
          }
        });
        cal.append(cell);
      }
      const who = h('div', { class: 'dp-who' }, PEOPLE.map((p, i) => stagger(h('span', { class: 'dp-av' }, h('i', { style: `background:${p.c}`, text: p.n[0] }), p.n), i, 100, 160)));
      const rec = stagger(h('div', { class: 'dp-rec' },
        h('span', { class: 'rk', text: '1' }),
        h('div', {}, h('b', { text: '1/15(금) ~ 1/16(토) · 1박 2일' }), h('small', { text: '4명 모두 가능해요' })),
        h('span', { class: 'dp-pill', text: '전원 가능' })), 0, 3500);
      const stamp = stagger(h('div', { class: 'dp-stamp dates', text: '날짜 확정!' }), 0, 4600);
      return h('div', { class: 'dp-scene' }, who, cal, rec, stamp);
    }

    // ── 장면 2: 일정표
    function scenePlan() {
      const items = [
        ['08:30', 'move', '이동', '김포공항 출발', '김포공항', '85,000원'],
        ['12:00', 'food', '식사', '고기국수 점심', '제주시 일도동', '10,000원'],
        ['15:00', 'sight', '관광', '성산일출봉 오르기', '성산일출봉', '5,000원'],
        ['19:00', 'stay', '숙소', '숙소 체크인', '성산 게스트하우스', '60,000원'],
      ];
      return h('div', { class: 'dp-scene' },
        h('div', { class: 'dp-dayhead' }, h('b', { text: '1일차 · 1/15(금)' }), stagger(h('span', { class: 'dp-total', text: '예상 160,000원' }), 0, 2600)),
        h('ol', { class: 'dp-items' }, items.map((it, i) => stagger(h('li', {},
          h('span', { class: 'tm', text: it[0] }),
          h('div', {}, h('div', { class: 'tt' }, h('span', { class: 'cat cat-' + it[1], text: it[2] }), h('b', { text: it[3] })),
            h('div', { class: 'pl' }, h('span', { text: it[4] }), h('span', { class: 'mapchip', text: '구글' }), h('span', { class: 'mapchip', text: '네이버' }), h('span', { class: 'mapchip', text: '카카오' }))),
          h('span', { class: 'cost', text: it[5] })), i, 250, 550))),
        stagger(h('div', { class: 'dp-route' }, h('span', { class: 'pin', text: '●' }), '하루 동선 보기 · 김포공항 → 제주시 → 성산일출봉 → 숙소'), 0, 3000));
    }

    // ── 장면 3: 정산
    function sceneMoney() {
      const exp = [['숙소', '민지', '240,000원'], ['렌터카', '준호', '120,000원'], ['흑돼지 저녁', '서연', '80,000원']];
      const tx = [['도윤', '민지', '110,000원'], ['서연', '민지', '20,000원'], ['서연', '준호', '10,000원']];
      return h('div', { class: 'dp-scene' },
        h('ul', { class: 'dp-exp' }, exp.map((e, i) => stagger(h('li', {}, h('b', { text: e[0] }), h('small', { text: `${e[1]} 냄 · 4명이 나눔` }), h('span', { text: e[2] })), i, 200, 450))),
        stagger(h('div', { class: 'dp-sum' }, '총 440,000원 · 1인당 110,000원'), 0, 1700),
        h('ul', { class: 'dp-tx' }, tx.map((t, i) => stagger(h('li', {}, h('b', { text: t[0] }), h('span', { class: 'arrow', text: '→' }), h('b', { text: t[1] }), h('span', { class: 'amt', text: t[2] })), i, 2400, 500))),
        stagger(h('div', { class: 'dp-stamp ok', text: '송금 3번이면 끝' }), 0, 4300));
    }

    // ── 장면 4: 다이어리
    function sceneDiary() {
      const text = '바람이 엄청 불었지만 성산일출봉 꼭대기에서 본 바다가 최고였다. 다음엔 우도도 가자!';
      const bodyEl = h('p', { class: 'dp-diary-text' });
      const photo = h('div', { class: 'dp-photo', 'aria-label': '예시 사진: 바다 위 해돋이' }, h('i', { class: 'sun' }), h('i', { class: 'sea' }), h('i', { class: 'hill' }));
      if (reduce) bodyEl.textContent = text;
      else {
        let i = 0;
        const t0 = setTimeout(function tick() {
          if (!alive) return;
          bodyEl.textContent = text.slice(0, ++i);
          if (i < text.length) typeTimers.push(setTimeout(tick, 45));
        }, 1300);
        typeTimers.push(t0);
      }
      return h('div', { class: 'dp-scene' },
        stagger(h('div', { class: 'dp-diary' },
          h('div', { class: 'dp-dhead' }, h('span', { text: '1월 15일 · 민지' }), h('span', { class: 'dp-mood', text: '최고' })),
          h('b', { text: '1일차, 바람 속의 일출봉' }),
          photo, bodyEl), 0, 150),
        stagger(h('div', { class: 'dp-likes' }, PEOPLE.slice(1).map(p => h('i', { style: `background:${p.c}`, text: p.n[0] })), '준호, 서연, 도윤도 봤어요'), 0, 5200));
    }

    const RENDER = { dates: sceneDates, plan: scenePlan, money: sceneMoney, diary: sceneDiary };

    function go(i, user) {
      idx = (i + SCENES.length) % SCENES.length;
      typeTimers.splice(0).forEach(clearTimeout);
      const s = SCENES[idx];
      stage.replaceChildren(RENDER[s.key]());
      stage.classList.toggle('static', reduce);
      capTitle.textContent = `${idx + 1}. ${s.title}`;
      capBody.textContent = s.body;
      drawSteps();
      if (playing) schedule(DURATION);
      if (user) host.querySelector('.dp-step.on')?.focus({ preventScroll: true });
    }
    function schedule(ms) {
      clearTimeout(timer); startedAt = Date.now(); remaining = ms;
      timer = setTimeout(() => { if (alive && playing) go(idx + 1); }, ms);
    }
    // 탭이 가려지면 멈췄다가, 다시 보이면 남은 시간만큼 이어서 재생
    let pausedByHide = false;
    const onVis = () => {
      if (!playing) return;
      if (document.hidden) {
        if (pausedByHide) return;
        pausedByHide = true; clearTimeout(timer);
        remaining = Math.max(800, remaining - (Date.now() - startedAt));
      } else if (pausedByHide) { pausedByHide = false; schedule(remaining); }
    };
    document.addEventListener('visibilitychange', onVis);
    go(0);
    return () => { alive = false; clearTimeout(timer); typeTimers.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVis); };
  }

  window.EBLanding = { mount };
})();
