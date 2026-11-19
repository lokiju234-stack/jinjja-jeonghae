# 얘들아 이제는 진짜 정해야해

링크 하나로 모두가 되는 날을 찾아 주는 일정 맞추기 서비스.

- 방장이 날짜 범위와 일정 길이(하루 / 1박 2일 / 2박 3일 / 3박 4일)를 정해 **일정을 만들고**, 링크를 공유합니다.
- 링크를 받은 사람은 **구글 로그인** 또는 **이메일 회원가입/로그인** 후 안 되는 날(또는 되는 날)만 표시합니다.
- 응답이 모이면 **추천 날짜 순위**, 날짜별 가능 인원, 사람×날짜 표가 실시간으로 갱신됩니다.
- 방장 메뉴: 응답 마감/다시 열기, 일정 삭제, 링크로 못 들어오는 사람 **대신 입력**.

빌드 도구가 필요 없는 정적 사이트(HTML/CSS/JS)이고, 로그인과 데이터베이스는 [Supabase](https://supabase.com)가 맡습니다.

```
index.html          화면 뼈대
css/style.css       디자인
js/config.js        Supabase 주소/키 (비우면 데모 모드)
js/backend.js       Supabase / 데모(localStorage) 어댑터
js/dates.js         날짜 계산, 공휴일 표
js/app.js           화면과 라우팅 (#/login, #/signup, #/new, #/e/코드 …)
supabase/schema.sql 데이터베이스 테이블, 보안 규칙(RLS), 함수
```


## 현재 운영 정보

| 항목 | 값 |
|---|---|
| 사이트 | https://jinjja-jeonghae.vercel.app |
| 코드 | https://github.com/lokiju234-stack/jinjja-jeonghae (main에 push하면 Vercel이 자동 배포) |
| Supabase 프로젝트 | `jinjja-jeonghae` (ref `sghwlbpksndwwqoinukt`, 도쿄 리전) |
| Google Cloud 프로젝트 | `jinjja-jeonghae` (OAuth 클라이언트 `jinjja-jeonghae web`, 프로덕션 게시됨) |
| 로그인 | 이메일(인증 메일 확인 켜짐), Google |
| 메일 발송 | Gmail SMTP (codasoundcrew@gmail.com, 앱 비밀번호, 하루 약 500통), 한국어 템플릿 |

> 메일은 Gmail SMTP로 보냅니다. 하루 발송량이 많아지면 도메인을 구입해 Resend 등으로 옮기세요. Supabase 기본 발송 한도는 시간당 30통이며 Authentication > Rate Limits 에서 조정합니다.

---

## 1. 지금 바로 써 보기 (데모 모드)

`js/config.js`가 비어 있으면 데모 모드로 돌아갑니다. 데이터는 그 브라우저에만 저장되고, 구글 로그인은 테스트 계정으로 대신합니다.

```bash
cd eonjebollae
python3 -m http.server 8080
```

브라우저에서 http://localhost:8080 을 엽니다. 다른 사람 역할을 해 보려면 로그아웃한 뒤 다른 이메일로 가입하면 됩니다.

## 2. 실제 서비스로 연결하기

### 2-1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 가입 후 **New project** (리전은 `Northeast Asia (Seoul)` 추천).
2. 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용을 전부 붙여 넣고 **Run**.
3. **Project Settings → API** 에서 `Project URL`과 `anon public` 키를 복사해 `js/config.js`에 넣습니다.
   - `service_role` 키는 절대 넣지 마세요. 브라우저에 노출되면 모든 데이터가 열립니다.

### 2-2. 이메일 회원가입 설정
**Authentication → Providers → Email** 이 켜져 있는지 확인합니다.
- `Confirm email`을 켜 두면 가입 후 인증 메일 링크를 눌러야 로그인됩니다 (출시할 때는 켜 두는 걸 권장).
- 기본 메일 발송은 시간당 몇 통으로 제한돼 있어요. 실제 출시 전에는 **Authentication → SMTP Settings** 에서 자체 메일 서버(예: Resend, AWS SES)를 연결하세요.
- **Authentication → Email Templates** 에서 인증/비밀번호 재설정 메일 문구를 한국어로 바꿀 수 있습니다.

### 2-3. 구글 로그인 설정
1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성 → **APIs & Services → OAuth consent screen**
   - User type: External, 앱 이름 `얘들아 이제는 진짜 정해야해`, 지원 이메일, 로고 등 입력.
   - 범위(Scopes)는 기본값(`email`, `profile`, `openid`)이면 충분합니다.
2. **Credentials → Create credentials → OAuth client ID** → Application type: **Web application**
   - **Authorized redirect URIs** 에 Supabase가 알려 주는 주소를 넣습니다:
     `https://<프로젝트ID>.supabase.co/auth/v1/callback`
     (Supabase **Authentication → Providers → Google** 화면에 정확한 주소가 나옵니다.)
3. 만들어진 **Client ID / Client Secret** 을 Supabase **Authentication → Providers → Google** 에 붙여 넣고 Enable.
4. 출시 전 OAuth 동의 화면을 **Publish(프로덕션)** 상태로 바꿔야 테스트 사용자 외에도 로그인할 수 있습니다.

### 2-4. 사이트 주소 등록
Supabase **Authentication → URL Configuration**
- **Site URL**: 배포한 주소 (예: `https://eonjebollae.vercel.app`)
- **Redirect URLs**: 배포 주소와 로컬 테스트 주소를 모두 추가
  - `https://eonjebollae.vercel.app/**`
  - `http://localhost:8080/**`

### 2-5. 배포
정적 파일이라 어디든 올릴 수 있습니다.
- **Vercel / Netlify**: 이 폴더를 GitHub 저장소로 올린 뒤 연결하면 끝 (빌드 명령 없음, 출력 폴더는 루트).
- **Cloudflare Pages**, **GitHub Pages** 도 같은 방식.
- 도메인을 사면(예: `jinjja-jeonghae.com`) 2-3, 2-4의 주소도 새 도메인으로 바꿔 주세요.

---

## 3. 데이터와 보안 구조

| 테이블 | 내용 | 누가 읽나 | 누가 쓰나 |
|---|---|---|---|
| `events` | 일정(방): 제목, 날짜 범위, 길이, 마감 여부, 공유 코드 | 방장 (링크 소지자는 `get_event` 함수로) | 방장 |
| `responses` | 참여자별 응답: 표시 이름, 기본값(가능/불가), 날짜별 상태, 메모 | 본인·방장 (링크 소지자는 `list_responses` 함수로) | 본인, 대신 입력분은 방장 |

- 링크의 코드(8자리 무작위)를 아는 **로그인한 사용자**만 일정과 응답을 볼 수 있습니다. 전체 목록을 훑을 방법은 없습니다.
- 마감된 일정은 데이터베이스 규칙에서 막혀서 수정되지 않습니다.
- 실시간 갱신은 Supabase Realtime 브로드캐스트(“바뀜” 신호만 전달) + 30초 주기 새로고침으로 동작합니다.

## 4. 출시 전 체크리스트
- [ ] `#/terms`, `#/privacy` 초안을 운영자 정보와 함께 법률 검토 받아 확정 (js/app.js의 `viewLegal`)
- [ ] 회원 탈퇴 기능 (Supabase Edge Function에서 `auth.admin.deleteUser` 호출 필요)
- [ ] 자체 SMTP 연결, 메일 템플릿 한국어화
- [ ] 구글 OAuth 동의 화면 프로덕션 게시
- [ ] 공휴일 표(`js/dates.js`)를 매년 갱신
- [ ] 카카오 로그인이 필요하면 Supabase Providers 에서 Kakao 추가 (코드에서는 `signInWithOAuth({provider:'kakao'})`)
- [ ] 카카오톡 공유 미리보기용 `og:image` 추가
