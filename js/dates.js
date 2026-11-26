// 날짜 도우미와 한국 공휴일 (참고용 표기 — 해마다 확인해서 추가하세요)
(function () {
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dow = s => parse(s).getDay();
  const short = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };
  const long = s => { const d = parse(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };

  function list(start, end) {
    const out = [];
    for (let s = start; s <= end && out.length < 400; s = addDays(s, 1)) out.push(s);
    return out;
  }
  // 범위가 걸친 달들: [{y, m(0-11), label}]
  function months(start, end) {
    const out = [];
    const a = parse(start), b = parse(end);
    let y = a.getFullYear(), m = a.getMonth();
    while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
      out.push({ y, m, label: `${y}년 ${m + 1}월` });
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  function rangeText(start, end) {
    const a = parse(start), b = parse(end);
    if (start === end) return long(start);
    if (a.getFullYear() === b.getFullYear())
      return `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getMonth() + 1}월 ${b.getDate()}일`;
    return `${long(start)} ~ ${long(end)}`;
  }

  const HOLIDAYS = {
    '2026-01-01': '신정', '2026-02-16': '설 연휴', '2026-02-17': '설날', '2026-02-18': '설 연휴',
    '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날', '2026-05-24': '부처님오신날',
    '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-06-06': '현충일', '2026-08-15': '광복절',
    '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
    '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
    '2027-01-01': '신정', '2027-02-06': '설 연휴', '2027-02-07': '설날', '2027-02-08': '설 연휴',
    '2027-02-09': '대체공휴일', '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날',
    '2027-06-06': '현충일', '2027-08-15': '광복절', '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴',
    '2027-09-15': '추석', '2027-09-16': '추석 연휴', '2027-10-03': '개천절', '2027-10-04': '대체공휴일',
    '2027-10-09': '한글날', '2027-10-11': '대체공휴일', '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
    '2028-01-01': '신정', '2028-01-25': '설 연휴', '2028-01-26': '설날', '2028-01-27': '설 연휴', '2028-03-01': '삼일절',
    '2028-04-12': '국회의원선거', '2028-05-02': '부처님오신날', '2028-05-05': '어린이날', '2028-06-06': '현충일', '2028-08-15': '광복절',
    '2028-10-02': '추석 연휴', '2028-10-03': '추석·개천절', '2028-10-04': '추석 연휴', '2028-10-05': '대체공휴일', '2028-10-09': '한글날',
    '2028-12-25': '성탄절',
    '2029-01-01': '신정', '2029-02-12': '설 연휴', '2029-02-13': '설날', '2029-02-14': '설 연휴', '2029-03-01': '삼일절',
    '2029-05-05': '어린이날', '2029-05-07': '대체공휴일', '2029-05-20': '부처님오신날', '2029-05-21': '대체공휴일', '2029-06-06': '현충일',
    '2029-08-15': '광복절', '2029-09-21': '추석 연휴', '2029-09-22': '추석', '2029-09-23': '추석 연휴', '2029-09-24': '대체공휴일',
    '2029-10-03': '개천절', '2029-10-09': '한글날', '2029-12-25': '성탄절',
    '2030-01-01': '신정', '2030-02-02': '설 연휴', '2030-02-03': '설날', '2030-02-04': '설 연휴', '2030-02-05': '대체공휴일',
    '2030-03-01': '삼일절', '2030-05-05': '어린이날', '2030-05-06': '대체공휴일', '2030-05-09': '부처님오신날', '2030-06-05': '지방선거',
    '2030-06-06': '현충일', '2030-08-15': '광복절', '2030-09-11': '추석 연휴', '2030-09-12': '추석', '2030-09-13': '추석 연휴',
    '2030-10-03': '개천절', '2030-10-09': '한글날', '2030-12-25': '성탄절',
  };
  // ※ 2028년 이후는 법정 기준으로 미리 계산한 값이에요. 정부가 임시공휴일 등을 발표하면 여기에 더해 주세요.

  const nightsLabel = n => n <= 1 ? '당일' : `${n - 1}박 ${n}일`;
  // 여행 날짜 요약: 확정 > 투표 중 > 미정
  function tripSummary(ev) {
    if (ev.confirmed_start) return { status: '확정', label: rangeText(ev.confirmed_start, ev.confirmed_end) + ' · ' + nightsLabel(list(ev.confirmed_start, ev.confirmed_end).length) };
    if (ev.date_mode === 'poll' && ev.start_date) return { status: '날짜 투표 중', label: `${rangeText(ev.start_date, ev.end_date)} 중에서` };
    return { status: '날짜 미정', label: ev.trip_days ? nightsLabel(ev.trip_days) + ' · 날짜 미정' : '날짜 미정' };
  }
  function tripDays(ev) {
    if (ev.confirmed_start) return list(ev.confirmed_start, ev.confirmed_end).length;
    return Math.max(1, Math.min(60, ev.trip_days || ((ev.default_nights ?? 1) + 1)));
  }

  window.EBDate = { DOW, pad, iso, parse, addDays, dow, short, long, list, months, rangeText, HOLIDAYS, nightsLabel, tripSummary, tripDays, today: () => iso(new Date()) };
})();
