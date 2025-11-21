# Upload Service Multi-Subscriber Pattern 문제 해결

**날짜**: 2025-11-22
**버전**: AIMS UIX3 v0.69.2
**심각도**: High (AR 자동 연결 기능 완전 실패)

---

## 📋 목차

1. [문제 증상](#문제-증상)
2. [문제 발생 시나리오](#문제-발생-시나리오)
3. [근본 원인 분석](#근본-원인-분석)
4. [해결 방법](#해결-방법)
5. [검증 방법](#검증-방법)
6. [관련 파일](#관련-파일)
7. [교훈 및 예방책](#교훈-및-예방책)

---

## 문제 증상

### 1차 증상: AR 뱃지 및 고객 자동 연결 실패

- **현상**: Annual Report(AR) PDF 업로드 시 AR 뱃지가 표시되지 않음
- **결과**: 고객과 문서가 자동으로 연결되지 않음
- **콘솔 로그**:
  ```
  ✅ [AR] is_annual_report=true 설정 완료 (metadata 포함): {success: false, error: 'userId is required'}
  🔍 [AR] 매핑 조회: documentId="undefined"
  ⚠️ [AR] 매핑을 찾을 수 없어서 자동 연결을 건너뜁니다.
  ```

### 2차 증상: statusCallback 미호출

- **핵심 로그 누락**: `🔍 [handleStatusChange]` 로그가 나타나지 않음
- **의미**: DocumentRegistrationView의 handleStatusChange 함수가 실행되지 않음
- **결과**: setAnnualReportFlag 함수가 호출되지 않아 AR 플래그 설정 실패

---

## 문제 발생 시나리오

### Timeline of Bug

```
T0: 사용자가 DocumentRegistrationView에서 AR 파일 선택
    → DocumentRegistrationView.tsx:1167에서 uploadService.setStatusCallback(handleStatusChange) 호출
    → uploadService.statusCallback = handleStatusChange (할당)

T1: AR 파일 업로드 큐에 추가됨

T2: 사용자가 다른 뷰(DocumentLibraryView)로 전환
    → PersonalFilesView.tsx 마운트됨
    → PersonalFilesView.tsx:536에서 uploadService.setStatusCallback(personalViewCallback) 호출
    → uploadService.statusCallback = personalViewCallback (덮어쓰기!)

T3: 업로드 완료, uploadService.statusCallback 호출
    → personalViewCallback 실행 (DocumentRegistrationView의 handleStatusChange가 아님!)

T4: DocumentRegistrationView의 handleStatusChange 절대 호출되지 않음
    → setAnnualReportFlag 미호출
    → is_annual_report 플래그 설정 실패
    → AR 뱃지 없음, 고객 자동 연결 실패
```

### 사용자 행동 패턴

사용자는 다음과 같이 행동할 수 있습니다:
- 파일 업로드 시작 후 다른 메뉴로 이동
- 여러 뷰를 빠르게 전환
- 브라우저 크기 조절 (React 컴포넌트 재마운트 유발)

**문제**: 기존 구조는 "사용자가 업로드 완료까지 가만히 기다린다"는 가정에 의존했음

---

## 근본 원인 분석

### 원인 1: Single-Callback Architecture (주 원인)

**문제 코드** (uploadService.ts - 수정 전):
```typescript
export class UploadService {
  private statusCallback?: StatusCallback  // ❌ 단일 콜백만 저장

  setStatusCallback(callback: StatusCallback): void {
    this.statusCallback = callback  // ❌ 이전 콜백 덮어쓰기!
  }

  private async uploadFile(uploadFile: UploadFile): Promise<void> {
    // ...
    this.statusCallback?.(id, 'completed')  // ❌ 마지막 등록된 콜백만 호출
  }
}
```

**분석**:
- uploadService는 전역 싱글톤 인스턴스
- 여러 컴포넌트(DocumentRegistrationView, PersonalFilesView 등)가 동시에 사용
- 나중에 마운트된 컴포넌트가 이전 컴포넌트의 콜백을 덮어씀
- **Publisher-Subscriber 패턴 미구현**

### 원인 2: x-user-id 헤더 누락 (부수적 원인)

**문제 코드** (DocumentRegistrationView.tsx:686 - 수정 전):
```typescript
const response = await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },  // ❌ x-user-id 헤더 없음
  body: JSON.stringify({ filename: fileName, metadata })
});
```

**백엔드 요구사항** (server.js):
```javascript
app.patch('/api/documents/set-annual-report', async (req, res) => {
  const userId = req.query.userId || req.headers['x-user-id'];
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId is required' });
  }
  // ...
});
```

**결과**:
- 백엔드가 400 Bad Request 응답
- documentId를 받지 못함 (undefined)
- 고객 자동 연결 불가능

### 원인 3: React Strict Mode의 이중 마운트

**React 18 Strict Mode**:
- 개발 모드에서 컴포넌트를 두 번 마운트/언마운트
- cleanup 함수 테스트를 위한 동작
- 결과적으로 콜백 등록/해제가 여러 번 발생

---

## 해결 방법

### 해결책 1: Multi-Subscriber Pattern 구현

**수정된 코드** (uploadService.ts):
```typescript
export class UploadService {
  // ✅ Set을 사용한 다중 구독자 지원
  private progressCallbacks = new Set<ProgressCallback>()
  private statusCallbacks = new Set<StatusCallback>()

  /**
   * ✅ unsubscribe 함수를 반환하여 메모리 누수 방지
   */
  setStatusCallback(callback: StatusCallback, owner?: string): () => void {
    this.statusCallbacks.add(callback)
    if (import.meta.env.DEV) {
      console.log(`✅ [UploadService] statusCallback 등록 (${owner || 'unknown'}) - 총 ${this.statusCallbacks.size}개`)
    }

    // ✅ unsubscribe 함수 반환
    return () => {
      this.statusCallbacks.delete(callback)
      if (import.meta.env.DEV) {
        console.log(`❌ [UploadService] statusCallback 제거 (${owner || 'unknown'}) - 남은 ${this.statusCallbacks.size}개`)
      }
    }
  }

  private async uploadFile(uploadFile: UploadFile): Promise<void> {
    // ✅ 모든 구독자에게 알림
    this.statusCallbacks.forEach(callback => callback(id, 'completed'))
  }
}
```

### 해결책 2: 컴포넌트에서 Unsubscribe 패턴 사용

**수정된 코드** (DocumentRegistrationView.tsx:1164-1176):
```typescript
useEffect(() => {
  const stableProgressCallback = /* ... */
  const stableStatusCallback = /* ... */

  // ✅ unsubscribe 함수 저장
  const unsubscribeProgress = uploadService.setProgressCallback(
    stableProgressCallback,
    'DocumentRegistrationView'
  )
  const unsubscribeStatus = uploadService.setStatusCallback(
    stableStatusCallback,
    'DocumentRegistrationView'
  )

  // ✅ 컴포넌트 언마운트 시 콜백 제거
  return () => {
    unsubscribeProgress()
    unsubscribeStatus()
  }
}, [])
```

**PersonalFilesView.tsx도 동일하게 수정**

### 해결책 3: x-user-id 헤더 추가

**수정된 코드** (DocumentRegistrationView.tsx:685-695):
```typescript
try {
  const metadata = arMetadataMappingRef.current.get(fileName);

  // ✅ userId 헤더 추가
  const userId = typeof window !== 'undefined'
    ? localStorage.getItem('aims-current-user-id') || 'tester'
    : 'tester';

  const response = await fetch('http://tars.giize.com:3010/api/documents/set-annual-report', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId  // ✅ 헤더 추가
    },
    body: JSON.stringify({ filename: fileName, metadata })
  });
  const responseData = await response.json();
  console.log(`✅ [AR] is_annual_report=true 설정 완료:`, responseData);
  // ...
```

---

## 검증 방법

### 1. 콘솔 로그 확인

**정상 작동 시 로그**:
```
✅ [UploadService] statusCallback 등록 (DocumentRegistrationView) - 총 1개
✅ [UploadService] statusCallback 등록 (PersonalFilesView) - 총 2개
🔍 [handleStatusChange] fileId=..., status=uploading
🔍 [handleStatusChange] Matched file: name=정부균보유계약현황202508.pdf
🔍 [handleStatusChange] fileId=..., status=completed
✅ [handleStatusChange] AR 파일 업로드 완료, 고객 자동 연결 예약
[UploadService] 파일 업로드 성공: 정부균보유계약현황202508.pdf
✅ [AR] is_annual_report=true 설정 완료: {success: true, document_id: "6920c9df44f6eb919ecd498b"}
🔍 [AR] 매핑 조회: documentId="6920c9df44f6eb919ecd498b"  ← ✅ documentId 정상
🔗 [AR 자동 연결] 문서 처리 완료 확인, 연결 시작
✅ [AR 자동 연결] 완료
```

**실패 시 로그 (수정 전)**:
```
❌ documentId="undefined"  ← 문제!
❌ 🔍 [handleStatusChange] 로그 없음  ← 콜백 미호출!
```

### 2. 기능 테스트

1. **AR 파일 업로드**
   - 정부균 AR PDF 업로드
   - AR 뱃지 표시 확인
   - 고객 자동 연결 확인

2. **뷰 전환 중 업로드**
   - 파일 업로드 시작
   - 즉시 DocumentLibraryView로 전환
   - AR 뱃지와 고객 연결 여전히 성공 확인

3. **여러 컴포넌트 동시 사용**
   - DocumentRegistrationView와 PersonalFilesView 동시 열기
   - 양쪽에서 파일 업로드
   - 모두 정상 작동 확인

### 3. TypeScript 검사

```bash
cd frontend/aims-uix3
npm run typecheck
```

### 4. 단위 테스트 (기존)

```bash
cd frontend/aims-uix3
npm test -- DocumentRegistrationView.ar-autolink.test.tsx
```

**참고**: 기존 25개 테스트는 단일 컴포넌트만 테스트하므로 이번 버그를 잡지 못했음

---

## 관련 파일

### 수정된 파일

| 파일 | 수정 내용 | 라인 |
|------|----------|------|
| `uploadService.ts` | Multi-subscriber 패턴 구현 | 42-79 |
| `DocumentRegistrationView.tsx` | unsubscribe 패턴 + x-user-id 헤더 | 685-695, 1164-1176 |
| `PersonalFilesView.tsx` | unsubscribe 패턴 | 536-567 |

### 관련 문서

- [CLAUDE.md](../CLAUDE.md) - 프로젝트 개발 철학
- [CSS_ICON_CACHING_ISSUE.md](./CSS_ICON_CACHING_ISSUE.md) - 아이콘 캐싱 문제
- [ICON_IMPLEMENTATION_TROUBLESHOOTING.md](./ICON_IMPLEMENTATION_TROUBLESHOOTING.md) - 아이콘 구현 가이드

---

## 교훈 및 예방책

### 1. 전역 싱글톤 서비스 설계 시 주의사항

**문제가 된 설계**:
```typescript
// ❌ 나쁜 예: 단일 콜백
class Service {
  private callback?: Callback
  setCallback(cb: Callback) { this.callback = cb }
}
```

**올바른 설계**:
```typescript
// ✅ 좋은 예: 다중 구독자
class Service {
  private callbacks = new Set<Callback>()
  subscribe(cb: Callback): UnsubscribeFn {
    this.callbacks.add(cb)
    return () => this.callbacks.delete(cb)
  }
}
```

### 2. Publisher-Subscriber 패턴 체크리스트

전역 서비스를 만들 때 다음을 확인:

- [ ] 여러 컴포넌트가 동시에 사용할 수 있는가?
- [ ] 컴포넌트가 마운트/언마운트될 때 콜백이 등록/해제되는가?
- [ ] React Strict Mode에서 이중 마운트를 처리하는가?
- [ ] unsubscribe 함수를 제공하여 메모리 누수를 방지하는가?

### 3. API 헤더 검증

백엔드 API 호출 시:

- [ ] 설계사별 데이터 격리(x-user-id) 헤더 필수 확인
- [ ] 백엔드 에러 응답 명확히 로깅
- [ ] 400/401 에러 시 헤더 누락 의심

### 4. 콘솔 로그 전략

디버깅을 위한 로그 추가:

```typescript
if (import.meta.env.DEV) {
  console.log(`✅ [Service] 작업 시작 - owner: ${owner}, 총: ${this.subscribers.size}`)
}
```

- 작업 시작/완료 시점 명확히 표시
- 소유자(owner) 정보로 어느 컴포넌트인지 추적
- 구독자 수로 다중 구독 확인

### 5. 통합 테스트 필요성

**단위 테스트만으로는 부족**:
- 여러 컴포넌트 동시 마운트 시나리오
- 뷰 전환 중 비동기 작업 시나리오
- React Strict Mode 환경 테스트

**추천**:
```typescript
describe('UploadService Multi-Component', () => {
  it('should handle callbacks from multiple components', () => {
    const callback1 = jest.fn()
    const callback2 = jest.fn()

    const unsub1 = uploadService.setStatusCallback(callback1, 'Component1')
    const unsub2 = uploadService.setStatusCallback(callback2, 'Component2')

    // Upload file
    uploadService.queueFiles([file])

    // Both callbacks should be called
    expect(callback1).toHaveBeenCalled()
    expect(callback2).toHaveBeenCalled()

    unsub1()
    unsub2()
  })
})
```

### 6. CLAUDE.md 규칙 준수

이번 문제 해결 과정에서:

- ✅ 최소한 수정 원칙: uploadService와 관련 컴포넌트만 수정
- ✅ 코드 원복 원칙: 여러 번 실패 후 git restore로 깨끗한 상태 유지
- ✅ 사용자 승인 후 커밋: 구현 완료 후 사용자 검증 대기

**교훈**: CLAUDE.md의 개발 철학은 버그 예방과 빠른 디버깅에 필수적

---

## 참고: 디버깅 과정 타임라인

**시작**: AR 파일 업로드 시 뱃지 안 붙고 고객 연결 실패
**1차 시도**: x-user-id 헤더 누락 발견 → 부분 해결
**2차 시도**: cleanup() 함수 문제 의심 → 실패
**3차 시도**: PersonalFilesView cleanup() 호출 제거 → 실패
**핵심 발견**: `🔍 [handleStatusChange]` 로그 없음! → 콜백 미호출 확인
**근본 원인**: uploadService 단일 콜백 구조 → PersonalFilesView가 덮어씀
**최종 해결**: Multi-subscriber 패턴 구현 → ✅ 성공!

**소요 시간**: 약 3시간
**핵심 교훈**: 콘솔 로그가 없다는 것은 함수가 호출되지 않았다는 명확한 증거

---

## 결론

이 문제는 **전역 싱글톤 서비스의 잘못된 설계**에서 비롯되었습니다.

**핵심 원칙**:
1. 전역 서비스는 **다중 구독자(Multi-Subscriber)** 패턴으로 설계
2. **unsubscribe 함수**로 메모리 누수 방지
3. 백엔드 API 호출 시 **헤더 검증** 철저히
4. **콘솔 로그**로 호출 흐름 추적
5. **통합 테스트**로 실제 사용 시나리오 검증

이 문서는 향후 유사한 문제 발생 시 빠른 진단과 해결을 위한 가이드입니다.
