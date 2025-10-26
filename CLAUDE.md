# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 핵심 개발 철학 - 최우선 원칙 🎯

### UX 최우선주의 - 모든 것의 중심

**"최고의 UX를 위해서는 모든 것을 다 뜯어 고칠 용의가 있다."**

이것이 AIMS 프로젝트의 근본 철학입니다.

#### 핵심 가치

1. **사용자가 중심이다**
   - 모든 결정의 기준은 "사용자에게 더 나은가?"
   - 기술적 완성도보다 사용자 경험이 우선
   - 사용자가 느끼는 불편함은 즉시 해결해야 할 최우선 과제

2. **UX 개선을 위해서라면 모든 것을 뜯어고칠 용의가 있다**
   - 기존 코드가 아무리 잘 작성되어 있어도
   - 아키텍처가 아무리 훌륭해도
   - 이미 많은 시간을 투자했어도
   - **UX가 더 나아진다면 주저 없이 전면 개편한다**

3. **이것이 진정한 개발자의 자세다**
   - 코드에 대한 애착보다 사용자에 대한 책임감
   - 기술 자랑보다 실용성
   - 완벽한 설계보다 완벽한 경험

#### 실천 원칙

```
UX 문제 발견 시:
1. "이게 정말 사용자에게 불편한가?" 확인
2. "어떻게 하면 더 나아질까?" 고민
3. "기존 코드를 뜯어고쳐야 한다면?" → 주저 없이 실행
4. "전체를 다시 설계해야 한다면?" → 과감하게 결단
```

**기억하라**: 코드는 다시 짜면 되지만, 사용자의 시간은 돌아오지 않는다.

---

## ⚠️ CRITICAL RULES - 반드시 준수해야 할 규칙 ⚠️

### Git Commit 규칙 - 절대 위반 금지!

**절대로 사용자의 명시적 허락 없이 커밋하지 마세요!**

1. **코드 구현 완료 후 반드시:**
   - 구현 내용을 먼저 설명
   - **"커밋해도 될까요?"라고 묻지 말 것!**
   - 사용자가 "커밋해" 또는 유사한 승인을 할 때까지 대기

2. **절대 금지사항:**
   - 구현 후 자동으로 커밋하기
   - 사용자 검토 없이 커밋하기
   - 커밋 준비 상태를 임의로 판단하기

3. **이것이 중요한 이유:**
   - 사용자가 구현이 올바르게 작동하는지 확인해야 함
   - 문제있는 코드가 커밋되는 것을 방지
   - 커밋 전 문제 수정 기회 제공

**기억하세요: 사용자가 반드시 검사하고 승인한 후에만 커밋!**

4. **커밋 메시지 작성 규칙:**
   - **모든 커밋 메시지는 한글로 작성**
   - 제목과 본문 모두 한글 사용
   - 명확하고 이해하기 쉬운 한국어로 설명
   - 영어 전문 용어는 괄호 안에 병기 가능 (예: "데이터 새로고침(refresh)")

### 최소한 수정 원칙 - 철칙!

**부작용을 누적하지 말고 최소한의 수정만 해서 커밋하라!**

1. **하나의 기능, 최소한의 변경:**
   - 요청된 기능에 **직접적으로 필요한 부분만** 수정
   - 관련 없는 코드는 절대 건드리지 않기
   - "김치를 사러 갔다가 냉장고까지 사오지 말기"

2. **변경 범위 제한:**
   - 전체 파일을 리팩토링하지 말고 **해당 부분만** 수정
   - 하드코딩 → CSS 변수 등의 "개선"은 별도 작업으로 분리
   - 스타일 통일화는 요청받지 않았다면 하지 않기

3. **커밋 전 변경사항 검토:**
   - `git diff`로 변경사항이 **요청한 기능과 직접 관련된 것만** 있는지 확인
   - 불필요한 변경사항이 있다면 되돌리거나 별도 커밋으로 분리
   - 의도하지 않은 파일 변경이 있는지 점검

4. **부작용 방지가 최우선:**
   - 기존 동작하던 기능이 깨지는 것을 절대 방지
   - 작은 변경으로 큰 부작용을 만들지 않기
   - 확실하지 않으면 변경하지 않기

5. **⚠️ 진단과 구현의 일치성 검증 - 신규 추가!**
   - **문제 진단이 "색상 문제"라면 오직 CSS만 수정**
   - **문제 진단이 "로직 문제"라면 오직 해당 로직만 수정**
   - 진단 결과와 다른 영역을 수정하는 것은 **최소 수정 원칙 위반**
   - 예시:
     ```
     ❌ 잘못된 예: "색상 대비 문제" 진단 → CSS + JavaScript 둘 다 수정
     ✅ 올바른 예: "색상 대비 문제" 진단 → CSS만 수정
     ❌ 잘못된 예: "상태 관리 문제" 진단 → 상태 로직 + 스타일 둘 다 수정
     ✅ 올바른 예: "상태 관리 문제" 진단 → 상태 로직만 수정
     ```

**원칙**: 작고 집중된 변경사항이 안전하고 유지보수하기 좋다!

**새로운 철칙**: 진단한 문제 영역 외의 코드를 건드리는 것은 금지!

### 코드 원복 원칙 - 철칙! 🔄

**구현이 안되면 즉시 원복 후 재구현! 쓰레기 상태에서 계속 작업하면 코드가 걸레된다!**

1. **구현 실패 시 즉시 원복:**
   - 시도한 방법이 작동하지 않으면 **즉시 git checkout으로 원복**
   - 잘못된 코드 위에 또 다른 수정을 쌓지 말 것
   - "이것만 더 고치면 될 것 같은데" 라는 생각은 함정!

2. **원복 후 재구현:**
   - 깨끗한 상태에서 **처음부터 다시 생각**
   - 이전 시도에서 배운 점을 바탕으로 **더 나은 접근법** 사용
   - 여러 번의 작은 실수보다 한 번의 올바른 구현이 낫다

3. **쓰레기 코드 누적 방지:**
   - 실패한 시도의 흔적(주석, 사용하지 않는 코드)을 남기지 말 것
   - 임시 해결책을 쌓아올리지 말 것
   - 코드가 지저분해지면 전체 품질이 떨어진다

4. **원복 시점 판단:**
   ```
   ✅ 원복해야 하는 상황:
   - 2번 시도했는데도 작동하지 않음
   - 기존 기능이 깨짐
   - 코드가 점점 복잡해짐
   - 뭘 고쳐야 할지 헷갈림

   ❌ 계속 시도해야 하는 상황:
   - 명확한 오타나 단순 실수
   - 디버깅 로그로 원인 파악됨
   ```

**원칙**: 깨끗한 코드는 깨끗한 상태에서 나온다! 망가진 코드 위에 쌓지 말고 원복 후 재구현!

### 하드코딩 금지 규칙 - 절대 준수! ⚠️

**CSS 하드코딩은 절대 금지! CSS 변수 하드코딩도 절대 금지!**

테스트를 위한 임시코드를 제외하고는 하드코딩을 절대 금지한다!

#### 1. CSS 색상값 하드코딩 절대 금지

**❌ 절대 금지되는 하드코딩 예시:**
```css
/* CSS 파일에서 직접 색상값 입력 금지 */
.component {
  background: #ffffff;  /* ❌ 절대 금지 */
  color: #2c2c2e;  /* ❌ 절대 금지 */
  border: 1px solid rgba(0, 0, 0, 0.1);  /* ❌ 절대 금지 */
}

html[data-theme="dark"] .component {
  background: #2c2c2e;  /* ❌ 절대 금지 */
  color: #ffffff;  /* ❌ 절대 금지 */
}
```

```tsx
/* JSX inline style에서 색상값 직접 입력 금지 */
<div style={{ backgroundColor: '#ffffff' }}>  {/* ❌ 절대 금지 */}
<div style={{ color: 'rgba(0, 0, 0, 0.8)' }}>  {/* ❌ 절대 금지 */}
```

**✅ 올바른 방법 - CSS 변수 사용:**
```css
/* CSS 파일에서 변수 사용 */
.component {
  background: var(--color-bg-primary);  /* ✅ 올바름 */
  color: var(--color-text-primary);  /* ✅ 올바름 */
  border: 1px solid var(--color-border);  /* ✅ 올바름 */
}
```

```tsx
/* JSX에서는 className 사용 (inline style 금지) */
<div className="component">  {/* ✅ 올바름 */}
```

#### 2. CSS 변수 하드코딩도 금지

**❌ CSS 변수를 CSS 파일에 직접 정의하는 것도 금지:**
```css
/* 컴포넌트별 CSS 파일에서 변수 정의 금지 */
.component {
  --custom-color: #ffffff;  /* ❌ 절대 금지 */
  background: var(--custom-color);
}
```

**✅ 올바른 방법 - 중앙 집중식 CSS 변수 시스템 사용:**
- `frontend/aims-uix3/src/styles/variables.css`에 정의된 변수만 사용
- 새로운 색상이 필요하면 `variables.css`에 추가 후 사용
- 모든 컴포넌트는 기존 변수 재사용

#### 3. 스타일 하드코딩 금지 원칙

1. **CSS 파일:**
   - 색상, 크기, 간격 등 모든 값은 CSS 변수 사용
   - `#ffffff`, `rgba()`, `16px` 등 직접 입력 금지
   - 예외: 계산식 (`calc()`)에서 숫자는 허용

2. **JSX inline style:**
   - 정적 색상값 절대 금지
   - 동적 계산값만 허용 (`width: ${dynamicValue}px`)
   - 런타임 위치만 허용 (`transform: translate()`)

3. **테마 시스템과 연동:**
   - 라이트/다크 모드 전환시 즉시 반영되어야 함
   - CSS 변수는 `variables.css`에서 테마별로 정의
   - JS에서는 클래스명만 조건부로 적용

#### 4. 허용되는 하드코딩 (매우 제한적)

**오직 테스트 목적의 임시 코드만 허용:**
- 개발 중 빠른 확인을 위한 디버깅 코드
- **단, 커밋 전에 반드시 제거하거나 CSS 변수로 리팩토링**

**테스트 중에도 가능하면 CSS 변수 사용 권장!**

#### 5. 위반시 조치

1. 하드코딩 발견시 **즉시 CSS 변수로 리팩토링**
2. 필요한 변수가 없으면 `variables.css`에 추가
3. 테마 시스템과 연동되도록 수정
4. 동적 반응 가능하도록 구조 개선

#### 6. 실제 위반 사례와 수정 예시

**❌ 위반 사례 (FileListSection.css):**
```css
.file-list-section {
  background: #ffffff;  /* ❌ 하드코딩 */
  border: 1px solid rgba(0, 0, 0, 0.1);  /* ❌ 하드코딩 */
}

html[data-theme="dark"] .file-list-section {
  background: #2c2c2e;  /* ❌ 하드코딩 */
  border-color: rgba(255, 255, 255, 0.1);  /* ❌ 하드코딩 */
}
```

**✅ 올바른 수정:**
```css
/* variables.css에 변수 정의 */
:root {
  --color-bg-section: #ffffff;
  --color-border-section: rgba(0, 0, 0, 0.1);
}

html[data-theme="dark"] {
  --color-bg-section: #2c2c2e;
  --color-border-section: rgba(255, 255, 255, 0.1);
}

/* FileListSection.css에서 변수 사용 */
.file-list-section {
  background: var(--color-bg-section);  /* ✅ 올바름 */
  border: 1px solid var(--color-border-section);  /* ✅ 올바름 */
}
```

#### 7. 체크리스트

커밋 전 반드시 확인:
- [ ] CSS 파일에 `#` 색상코드가 없는가?
- [ ] CSS 파일에 `rgba()`, `rgb()` 직접 사용이 없는가?
- [ ] inline style에 색상값이 없는가?
- [ ] 새로운 CSS 변수를 컴포넌트에서 정의하지 않았는가?
- [ ] 모든 색상이 `var(--color-*)`로 정의되어 있는가?
- [ ] 테마 전환시 모든 색상이 즉시 변경되는가?

**기억하라**:
- **CSS 하드코딩은 유지보수성을 떨어뜨리고 테마 시스템을 파괴한다!**
- **CSS 변수도 중앙에서만 정의! 각 컴포넌트에서 변수 정의 금지!**
- **"variables.css에 없으면 추가 → 사용" 이것이 유일한 방법!**

### CSS !important 사용 금지 규칙 - 절대 준수! 🚫

**`!important`는 절대 사용하지 않는다!**

1. **!important 사용 금지 이유:**
   - CSS 우선순위를 파괴하여 디버깅 어려움
   - 유지보수성 심각하게 저하
   - 다른 개발자가 수정하기 불가능하게 만듦
   - 기술부채 누적의 주범

2. **대신 사용할 방법:**
   - 더 구체적인 CSS 선택자 사용
   - CSS 구조 재설계
   - 컴포넌트 레벨에서 문제 해결
   - 필요시 전체 CSS 아키텍처 재검토

3. **예외 없음:**
   - "급한 수정"도 예외 없음
   - "일시적 해결"도 금지
   - 테스트 목적이라도 커밋 전 반드시 제거

**철칙**: `!important`를 써야겠다는 생각이 들면, CSS 구조를 재설계해야 할 시점!

### 아이콘 크기 규칙 - 절대 준수! 📏

**LeftPane CustomMenu 아이콘이 모든 아이콘의 기준이다!**

1. **기준 크기:**
   - LeftPane CustomMenu 아이콘: **16px** (SFSymbolSize.CALLOUT)
   - 이것이 AIMS 프로젝트의 **최대 아이콘 크기**

2. **절대 규칙:**
   - **어떠한 아이콘도 LeftPane CustomMenu 아이콘(16px)보다 커서는 안 된다**
   - 모든 아이콘은 16px **이하**여야 함
   - 16px과 **같거나 작아야** 함

3. **허용 크기:**
   ```
   ✅ 12px (SFSymbolSize.CAPTION_2)
   ✅ 13px (SFSymbolSize.CAPTION_1)
   ✅ 15px (SFSymbolSize.FOOTNOTE)
   ✅ 16px (SFSymbolSize.CALLOUT) - 최대 크기
   ❌ 17px (SFSymbolSize.BODY) - 금지
   ❌ 20px - 금지
   ❌ 24px - 금지
   ```

4. **적용 범위:**
   - 모든 SVG 아이콘 (width, height)
   - 모든 SFSymbol 컴포넌트 (size 속성)
   - 모든 커스텀 아이콘 컴포넌트
   - 버튼 내부 아이콘
   - 리스트 아이템 아이콘
   - 액션 버튼 아이콘

5. **위반 예시 및 수정:**
   ```tsx
   // ❌ 잘못된 예 - 20px는 16px보다 큼
   const baseProps = {
     width: 20,
     height: 20
   }

   // ✅ 올바른 예 - 16px 이하
   const baseProps = {
     width: 16,
     height: 16
   }

   // ❌ 잘못된 예 - BODY(17px)는 CALLOUT(16px)보다 큼
   <SFSymbol name="icon" size={SFSymbolSize.BODY} />

   // ✅ 올바른 예 - CALLOUT(16px) 이하
   <SFSymbol name="icon" size={SFSymbolSize.CALLOUT} />
   ```

6. **이유:**
   - LeftPane은 UI의 핵심 네비게이션
   - 모든 아이콘의 시각적 일관성 유지
   - 사용자 경험의 통일성 확보
   - 애플 디자인 가이드라인 준수

**기억하라**: LeftPane CustomMenu 아이콘(16px)이 최대 크기! 이보다 큰 아이콘은 존재해서는 안 된다!

### 인라인 스타일 가이드라인 ⚖️

**허용**: 동적 계산값 (`width: ${dynamicValue}px`), 런타임 위치 (`transform: translate()`)
**금지**: 정적 색상, 하드코딩된 값, 대량 중복 패턴, `!important`

**판단 기준**: "3개월 후에도 유지보수하기 쉬운가?"

### 공용 CSS 시스템 ⚡

- 5회 이상 반복 패턴 → 공용 클래스 추출
- 공용 클래스 카테고리: Layout, Interactive, Accent, Spacing
- CSS 변수 사용 필수

### React 개발 문제 해결 규칙 - 철칙! ⚠️

**React Real-time Refreshing 문제 시 절대 준수 사항**

1. **문제 발생 징후:**
   - 코드 변경 후 브라우저에 반영되지 않음
   - Ctrl+Shift+R (하드 리프레시)해도 화면이 변하지 않음
   - 메뉴 구조나 컴포넌트 변경사항이 보이지 않음
   - Hot Module Replacement(HMR)가 작동하지 않음

2. **절대 금지사항:**
   - **코드를 먼저 건드리지 말 것!**
   - 문제 원인을 코드에서 찾으려 하지 말 것
   - 추가 수정을 통해 해결하려 하지 말 것

3. **반드시 따라야 할 해결 순서:**
   ```bash
   # 1단계: 모든 React 프로세스 종료
   pkill -f "react-scripts"
   
   # 2단계: React 캐시 완전 삭제
   rm -rf node_modules/.cache
   
   # 3단계: 새 서버 시작
   PORT=3005 npm start
   
   # 4단계: 컴파일 완료 대기
   # "Compiled successfully!" 메시지 확인
   
   # 5단계: 브라우저에서 하드 리프레시
   # Ctrl+Shift+R 또는 F5
   ```

4. **이 규칙이 중요한 이유:**
   - React 캐시 문제는 코드 변경과 무관하게 발생
   - 코드를 건드리면 문제가 더 복잡해짐
   - 캐시 삭제가 가장 빠르고 확실한 해결책
   - 불필요한 코드 변경으로 인한 부작용 방지

**기억하세요: React 화면 업데이트 문제 = 캐시 삭제 + 서버 재시작!**

### 백엔드 API 연동 규칙 - 절대 준수! ⚠️

**추측 금지, 실제 데이터 확인 필수!**

1. **API 응답 구조 확인 절차:**
   ```bash
   # 1단계: 반드시 실제 API 호출
   ssh tars.giize.com 'curl -s "http://localhost:3010/api/endpoint" | python3 -m json.tool'

   # 2단계: 응답 JSON 구조 완벽 파악
   # 3단계: 정확한 경로로 코드 작성
   # 4단계: 테스트
   ```

2. **절대 금지사항:**
   - ❌ API 응답 구조를 추측으로 코드 작성
   - ❌ 실패 후 또 다시 추측으로 수정
   - ❌ 사용자가 실제 데이터 보여줘도 제대로 안 보기
   - ❌ 같은 실수 반복하기

3. **올바른 순서:**
   ```
   ✅ 실제 API 응답 확인
   ✅ JSON 경로 정확히 파악
   ✅ 코드 작성
   ✅ 테스트

   실패 시:
   ✅ 다시 실제 API 응답 확인 (추측 금지!)
   ✅ 사용자가 제공한 실제 데이터 정밀 분석
   ```

4. **실제 사례: 응답 경로 착각**
   ```typescript
   // ❌ 추측으로 작성한 잘못된 경로들
   response.data.overallStatus
   response.data.computed.uiStages.overallStatus
   response.data.raw.uiStages.overallStatus

   // ✅ 실제 백엔드 응답 구조 확인 후 정답
   {
     "success": true,
     "data": {
       "computed": {
         "overallStatus": "completed"  // ← 여기!
       }
     }
   }
   response.data.computed.overallStatus
   ```

5. **이것이 중요한 이유:**
   - 10분이면 끝날 작업이 1시간 이상 소요
   - 사용자의 시간과 인내심 낭비
   - 코드 품질 저하
   - 신뢰 상실

**기억하라**: 확실하지 않으면 반드시 실제 데이터부터 확인! 추측은 시간 낭비!

---

## System Overview

AIMS (Agent Intelligent Management System) is an intelligent document management system for insurance salespeople. It automates repetitive tasks like document upload, classification, OCR, tagging, and case grouping to help salespeople better understand and respond to customers.

## Development Environment

- **Backend Server**: tars (Linux server) - accessible at `tars.giize.com`
- **Frontend Development**: WonderCastle (Windows 10 PC)
- **Database**: MongoDB on `tars:27017`

### 📂 프로젝트 경로 (절대 경로)

**⚠️ 중요: 경로 오인 방지를 위해 항상 정확한 경로 사용!**

- **tars 서버 프로젝트 루트**: `/home/rossi/aims`
- **로컬 프로젝트 루트**: `D:\aims`

**배포 스크립트 위치 예시:**
```bash
# tars 서버에서 실행시
cd /home/rossi/aims/backend/api/aims_api
./deploy_aims_api.sh

# 또는 홈 디렉토리 기준
cd ~/aims/backend/api/aims_api
./deploy_aims_api.sh
```

### ⚠️ 중요: 백엔드 수정 규칙

**백엔드 API 서버는 tars Linux 서버(`/home/rossi/aims`)에서 운영 중이며, SSH를 통해 직접 수정 가능합니다.**

#### 백엔드 수정 절차

1. **SSH로 서버 접속하여 코드 직접 수정**
   - tars 서버에 SSH 접속하여 백엔드 코드 수정 가능
   - 수정 후 반드시 배포 스크립트를 사용하여 서버 재시작

2. **로컬 저장소 동기화 (필수!)**
   - **서버 변경사항을 로컬에 100% 동일하게 반영**
   - 커밋은 대부분 로컬에서 진행하므로 반드시 동기화 필요
   - 로컬과 서버가 불일치하면 이후 배포 시 문제 발생

3. **서버 재시작 규칙 (절대 준수!)**
   - **반드시 배포 스크립트를 사용하여 서버 실행**
   - 직접 서버 실행 절대 금지 (환경변수, 로그 설정 누락 가능)

   **배포 스크립트 목록:**
   ```bash
   # Node.js API 서버 (포트 3010)
   ./deploy_aims_api.sh

   # Python Document Status API 서버 (포트 8000)
   ./deploy_doc_status_api.sh

   # Python RAG API 서버 (포트 8000, host network mode)
   ./deploy_aims_rag_api.sh

   # Python Annual Report API 서버 (포트 8004)
   ./deploy_annual_report_api.sh
   ```

4. **백엔드 수정 체크리스트**
   - [ ] tars 서버에서 코드 수정 완료
   - [ ] 배포 스크립트로 서버 재시작
   - [ ] 로컬 저장소에 동일한 변경사항 반영
   - [ ] `git diff`로 로컬-서버 일치 확인
   - [ ] API 테스트로 정상 작동 확인

**중요**: 로컬과 서버의 코드가 일치하지 않으면 이후 커밋과 배포에서 충돌 발생!

## Architecture

The system is organized into functional modules:

- **Frontend Application**: `frontend/aims-uix3/`
  - React + TypeScript + Vite
  - Document-Controller-View architecture
  - TanStack Query + Zustand state management
  - Apple design philosophy implementation

- **Backend Services**:
  - Node.js API server in `backend/api/aims_api/` for document status monitoring
  - Python FastAPI service in `backend/api/doc_status_api/` for document status API
  - MongoDB database on `tars:27017`

- **Core Python Modules** in `src/`:
  - `docmeta`: Document metadata extraction
  - `dococr`: OCR text extraction from images/PDFs
  - `doctag`: AI-based document tagging and classification
  - `doccase`: Document clustering by case/incident

- **Automation**: n8n workflows in `backend/n8n_flows/` for automated processing

## Common Development Commands

### Frontend Development (UIX3)
```bash
# Run development server (port 5177)
cd frontend/aims-uix3 && npm run dev

# Build for production
cd frontend/aims-uix3 && npm run build

# Run tests
cd frontend/aims-uix3 && npm test

# Type check
cd frontend/aims-uix3 && npm run typecheck

# E2E tests
cd frontend/aims-uix3 && npx playwright test
```

### Backend Services
```bash
# Start Node.js API server
cd backend/api/aims_api && npm start

# Start Python FastAPI service
cd backend/api/doc_status_api && uvicorn main:app --reload

# Start Python document status API
cd backend/api/doc_status_api && python main.py
```

### Python Development
```bash
# Run document metadata extraction
python scripts/run_docmeta.py --file ./samples/pdf/보험청구서.pdf

# Run full processing pipeline
python scripts/full_pipeline.py

# Run tests
make test
# or
PYTHONPATH=$(PWD) pytest -v
```

### Database & Search
```bash
# Check Qdrant vector database
python scripts/check_qdrant.py

# Create embeddings for search
python scripts/create_embeddings.py

# Perform RAG search
python scripts/rag_search.py
```

## Key Integration Points

- **WebSocket**: Real-time document status updates via `websocketService.js`
- **MongoDB**: Document storage and metadata in `docupload.files` collection
- **Vector Search**: Qdrant vector database for semantic document search
- **OCR Processing**: Integrated text extraction from images and PDFs
- **n8n Workflows**: Automated document processing pipelines

## File Structure Notes

- **Frontend (UIX3)**: Feature-Sliced Design architecture in `frontend/aims-uix3/`
- **Python Modules**: Shared pattern with `__init__.py` in `src/`
- **Sample Documents**: Organized by MIME type in `samples/`
- **Tools**: File analysis and smart search utilities in `tools/`
- **Scripts**: Processing and API tasks in `scripts/`

## Testing

- **Frontend**: Vitest + React Testing Library + Playwright E2E
- **Python**: pytest with `make test` or manual pytest commands
- **Sample Files**: Available in `samples/` for testing different document types

## Code Quality and Cleanup Guidelines

### 정리 요청 시 필수 검사 항목

사용자가 "정리" 또는 "코드 정리"를 요청할 때는 다음 모든 항목을 철저히 검사하고 개선해야 합니다:

1. **중복 코드 제거 (Duplicate Code Removal)**
   - 동일하거나 유사한 기능을 수행하는 코드 찾기
   - 공통 함수나 컴포넌트로 추출하여 재사용성 향상
   - 중복된 import문과 종속성 정리

2. **사용하지 않는 코드 제거 (Dead Code Elimination)**
   - 참조되지 않는 함수, 변수, 컴포넌트 찾기
   - 사용하지 않는 import문 제거
   - 도달할 수 없는 코드 블록 제거
   - 주석 처리된 오래된 코드 제거

3. **컴파일 오류 수정 (Compilation Error Fix)**
   - TypeScript/JavaScript 타입 오류 수정
   - 문법 오류와 런타임 오류 해결
   - 빌드 프로세스에서 발생하는 모든 경고 해결

4. **코드 품질 향상 (Code Quality Improvement)**
   - 일관된 코딩 스타일 적용
   - 변수명과 함수명 개선
   - 복잡한 함수를 작은 단위로 분리
   - 적절한 에러 처리 추가

5. **성능 최적화 (Performance Optimization)**
   - 불필요한 리렌더링 방지
   - 메모리 누수 방지
   - 비효율적인 알고리즘 개선

### 정리 작업 순서

1. **전체 코드베이스 스캔**: 모든 파일을 검토하여 문제점 파악
2. **우선순위 설정**: 컴파일 오류 → 중복 코드 → 미사용 코드 → 품질 개선 순서
3. **단계별 수정**: 한 번에 하나씩 문제를 해결하여 안정성 확보
4. **테스트 검증**: 각 수정 후 관련 기능이 정상 작동하는지 확인
5. **최종 빌드 테스트**: 전체 시스템이 오류 없이 빌드되는지 확인

**중요**: 정리 요청은 단순한 포맷팅이 아닌, 코드 품질과 유지보수성을 근본적으로 개선하는 작업입니다.

---

## 프로젝트 철학

- **점진적 개선**: 한 번에 하나씩 체계적으로
- **품질 우선**: 모든 경고 해결 후 진행
- **사용자 승인**: 커밋 전 확인 필수
- **문서화**: 변경사항 상세 기록

---

## AIMS 디자인 시스템 🎨

### 색상 시스템

| 요소 | Light | Dark |
|------|-------|------|
| 배경 | #f5f6f7, #ffffff | #374151, #4b5563 |
| 텍스트 | #1a1a1a, #6b7280 | #f9fafb, #d1d5db |
| 액션 | #3b82f6 | #2563eb |

### 핵심 원칙

- **톤과 분위기** 유지 (경직된 색상코드 금지)
- CSS 변수 사용 (`var(--color-primary)`)
- Light/Dark 테마 자연스러운 전환
- WCAG 2.1 AA 색상 대비 기준

**자세한 내용**: `frontend/aims-uix3/CSS_SYSTEM.md` 참조

---

## 🍎 애플 디자인 철학 (UIX3 표준)

### 3대 핵심 원칙

1. **Clarity (명확성)**: 정보 계층 구조 명확
2. **Deference (겸손함)**: UI가 콘텐츠 방해 금지
3. **Depth (깊이감)**: 자연스러운 시각적 계층

### Progressive Disclosure

- **기본**: 거의 보이지 않는 서브틀한 표현
- **상호작용**: 필요한 정보만 단계적 표시
- **철학**: "Invisible until you need it"

### 금지사항

- 화려한 그라데이션
- 강한 색상 강조
- 과도한 시각적 효과
- 항상 보이는 인디케이터

### 체크리스트

- [ ] iOS 공식 팔레트
- [ ] 서브틀한 기본 상태
- [ ] Progressive Disclosure 구현
- [ ] Light/Dark 테마 지원
- [ ] ARIA 접근성

---

## 🎨 AIMS-UIX3 툴팁 표준

**위치**: `@/shared/ui/Tooltip` (iOS 스타일, 다크모드 지원)

### 사용법

```tsx
import Tooltip from '@/shared/ui/Tooltip'

// 기본 사용
<Tooltip content="새로고침">
  <button onClick={handleClick} aria-label="새로고침">
    <RefreshIcon />
  </button>
</Tooltip>

// 컴포넌트 감싸기 (이벤트 전달용)
<Tooltip content="새로고침">
  <div style={{ display: 'inline-block' }}>
    <RefreshButton onClick={handleRefresh} />
  </div>
</Tooltip>
```

### 규칙

- ✅ `@/shared/ui/Tooltip` 사용, `aria-label` 유지
- ❌ 브라우저 `title` 속성 금지, 커스텀 툴팁 구현 금지

### 마이그레이션

1. `import Tooltip from '@/shared/ui/Tooltip'`
2. `title` 제거, `aria-label` 유지
3. 컴포넌트 감싸기 (`<Tooltip><div>...</div></Tooltip>`)

**참고**: DocumentLibraryView, CustomerRegionalView 적용 완료 (커밋 140d821)

---
