// 얘들아 이제는 진짜 정해야해 설정
// 두 값을 비워 두면 "데모 모드"로 동작합니다 (이 브라우저에만 저장, 실제 구글 로그인 없음).
// anon 키는 브라우저에 공개돼도 되는 키입니다. 데이터 보호는 supabase/schema.sql 의 RLS 규칙이 맡습니다.
// service_role 키는 절대 여기에 넣지 마세요.
window.EB_CONFIG = {
  SUPABASE_URL: 'https://sghwlbpksndwwqoinukt.supabase.co',
  // 카카오 로그인: 카카오 개발자 앱과 Supabase 설정을 마친 뒤 true 로 바꾸세요.
  KAKAO_LOGIN: false,
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnaHdsYnBrc25kd3dxb2ludWt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5ODI5ODYsImV4cCI6MjExMDU1ODk4Nn0.gndPmvWlCmZv2lfxyk9KyB2yIjgSx6j51w69spkt7qw',
};
