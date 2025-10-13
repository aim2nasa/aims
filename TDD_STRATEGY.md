# AIMS TDD 전략

## 프로젝트 현황

### 구조적 문제
- **중복 서버**: Node.js API 2개, Python API 2개가 각각 산재
- **테스트 파일 산재**: tests/, src/tests/ 등 흩어져 있음
- **테스트 커버리지 거의 없음**

### 시스템 아키텍처

```
frontend/                    # UI 애플리케이션들
├── aims-uix1/              # React (고객관리 메인 UI)
├── doc-status-dashboard/   # React (문서 상태 모니터링)
└── document-monitor/        # React (문서 추적)

api/                        # 백엔드 서비스들
├── server.js               # Node.js (고객관계 API)
└── python/main.py          # FastAPI (문서 처리 API)

src/                        # Python 비즈니스 로직
├── docmeta/               # 메타데이터 추출
├── dococr/                # OCR 처리
├── doctag/                # AI 태깅
└── doccase/               # 문서 클러스터링
```

### 서비스 포트

| 서비스 | 포트 | 기술 | 용도 |
|--------|------|------|------|
| Frontend (uix1) | 3005 | React | 고객관리 UI |
| Node.js API | 3010 | Express | 고객관계 관리 |
| Python Doc API | 8000 | FastAPI | 문서 처리 |
| RAG API | 8001 | FastAPI | RAG 검색 |

## TDD 도입 전략

### Phase 1: 테스트 인프라 (1주)

```bash
# Frontend
npm install --save-dev @testing-library/react @testing-library/jest-dom msw

# Backend (Node.js)
npm install --save-dev jest supertest mongodb-memory-server

# Backend (Python)
pip install pytest pytest-asyncio httpx pytest-mock
```

### Phase 2: 테스트 구조 설정

```
tests/
├── unit/                # 단위 테스트
│   ├── frontend/
│   ├── backend/
│   └── python/
├── integration/        # 통합 테스트
│   ├── api/
│   └── services/
├── e2e/               # End-to-End
├── fixtures/          # 테스트 데이터
└── setup/             # 설정
```

### Phase 3: 핵심 기능 테스트

**우선순위**:
1. 고객 관계 관리 (최근 버그 발생 영역)
2. 문서 처리 파이프라인
3. RAG 검색 기능

## 실행 가능한 첫 테스트

### RelationshipService 이벤트 테스트

```javascript
// __tests__/RelationshipService.test.js
describe('RelationshipService', () => {
  it('should dispatch relationshipChanged event on success', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => ({ success: true }) })
    );

    const eventSpy = jest.fn();
    window.addEventListener('relationshipChanged', eventSpy);

    await RelationshipService.createRelationship('c1', 'c2', { type: 'spouse' });

    expect(eventSpy).toHaveBeenCalled();
  });
});
```

### E2E 테스트 (Playwright)

```javascript
test('관계 생성 후 모든 뷰 자동 업데이트', async ({ page }) => {
  await page.goto('http://localhost:3005');
  await page.click('text=곽승철');
  await page.click('button:has-text("가족관계")');

  await page.fill('[data-testid="family-search"]', '송유미');
  await page.selectOption('[data-testid="relationship-type"]', 'spouse');
  await page.click('button:has-text("가족 관계 추가")');

  await expect(page.locator('text=관계가 생성되었습니다')).toBeVisible();
  await page.click('text=관계별 보기');

  // 로딩 없이 즉시 업데이트 확인
  await expect(page.locator('text=곽승철 (대표)')).toBeVisible();
});
```

### Python API 테스트

```python
# tests/test_document_api.py
@pytest.mark.asyncio
async def test_document_upload_and_processing():
    async with AsyncClient(app=app, base_url="http://test") as client:
        files = {"file": ("test.pdf", b"fake pdf", "application/pdf")}
        response = await client.post("/upload", files=files)

        assert response.status_code == 200
        doc_id = response.json()["document_id"]

        status = await client.get(f"/documents/{doc_id}/status")
        assert status.json()["status"] in ["processing", "completed"]
```

## 테스트 명령어

```bash
# Frontend 테스트
cd frontend/aims-uix1
npm test                    # 감시 모드
npm test -- --coverage      # 커버리지

# Backend (Python)
pytest
pytest -v --cov            # 커버리지

# E2E 테스트
npx playwright test
npx playwright test --headed
```

## 테스트 작성 가이드

### AAA 패턴
```javascript
it('should update relationship tree', () => {
  // Arrange (준비)
  const mockData = createMockRelationship();

  // Act (실행)
  const result = RelationshipService.create(mockData);

  // Assert (검증)
  expect(result).toBeDefined();
  expect(eventBus.emit).toHaveBeenCalledWith('relationshipChanged');
});
```

### 원칙
- 각 테스트는 독립적
- 테스트 순서에 의존하지 않음
- 테스트 후 정리 필수

## 우선순위

### 🔴 즉시 (1일 내)
1. 중복 파일 정리
2. 기본 테스트 구조 생성
3. 첫 테스트 작성

### 🟡 이번 주
1. 환경 설정 통합 (`.env.test`)
2. CI/CD 파이프라인 (GitHub Actions)
3. 테스트 커버리지 목표: 60%

### 🟢 이번 달
1. 구조 리팩토링 (monorepo 고려)
2. API 문서 자동 생성
3. 테스트 커버리지 80% 달성

---

**참고**:
- [Jest Documentation](https://jestjs.io/)
- [Pytest](https://docs.pytest.org/)
- [React Testing Library](https://testing-library.com/)
- [Playwright](https://playwright.dev/)
