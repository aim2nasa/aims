# AIMS TDD 도입 전략 및 프로젝트 구조 분석

## 📋 목차
1. [프로젝트 현황 분석](#프로젝트-현황-분석)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [TDD 도입 전략](#tdd-도입-전략)
4. [테스트 인프라 구축](#테스트-인프라-구축)
5. [우선순위 및 로드맵](#우선순위-및-로드맵)
6. [실행 가능한 첫 테스트](#실행-가능한-첫-테스트)

---

## 프로젝트 현황 분석

### 🔴 현재 문제점

#### 구조적 문제
- **중복 서버**: Node.js API 2개, Python API 2개가 각각 다른 위치에 산재
- **테스트 데이터 스크립트 중복**: `create_test_customers.js`, `create-test-customers.js` 등 중복 파일 존재
- **일관성 없는 네이밍**: 언더스코어(`_`) vs 하이픈(`-`) 혼용
- **테스트 파일 산재**: tests/, src/tests/, 각 폴더별로 테스트가 흩어져 있음
- **문서화 부재**: 시스템 전체 구조와 API 문서 부족

#### 기술 부채
- 테스트 커버리지 거의 없음
- 환경 설정 파편화
- 의존성 관리 혼란
- 수동 테스트에 의존

---

## 시스템 아키텍처

### 현재 프로젝트 구조

```
aims/
├── frontend/                    # UI 애플리케이션들
│   ├── aims-uix1/              # React (고객관리 메인 UI)
│   ├── doc-status-dashboard/   # React (문서 상태 모니터링)
│   └── document-monitor/        # React (문서 추적)
│
├── api/                        # 백엔드 서비스들
│   ├── server.js               # Node.js (고객관계 API)
│   ├── customer-relationships-routes.js
│   └── python/                 # FastAPI (문서 처리 API)
│       └── main.py
│
├── scripts/                    # 유틸리티 및 서비스
│   ├── api_server.py          # FastAPI (RAG 검색 API)
│   ├── rag_search.py          # RAG 검색 로직
│   └── create_*.js/py         # 테스트 데이터 생성 스크립트들
│
├── src/                        # Python 비즈니스 로직 모듈
│   ├── docmeta/               # 메타데이터 추출
│   ├── dococr/                # OCR 처리
│   ├── doctag/                # AI 태깅
│   ├── doccase/               # 문서 클러스터링
│   └── shared/                # 공통 유틸리티
│
├── n8n_flows/                 # n8n 워크플로우 자동화
│   └── DocPrepMain.json
│
└── tests/                     # 일부 테스트 파일
```

### 서비스 포트 맵핑

| 서비스 | 포트 | 기술 스택 | 용도 |
|--------|------|-----------|------|
| Frontend (aims-uix1) | 3005 | React + Ant Design | 고객관리 UI |
| Node.js API | 3010 | Express + MongoDB | 고객관계 관리 |
| Python Doc API | 8000 | FastAPI + MongoDB | 문서 처리 |
| RAG API | 8001 | FastAPI + Qdrant | RAG 검색 |
| MongoDB | 27017 | - | 데이터베이스 |
| Qdrant | 6333 | - | 벡터 DB |

### 주요 기술 스택

#### Frontend
- React 19.1.1
- Ant Design 5.x
- Tailwind CSS 4.x
- WebSocket (실시간 업데이트)

#### Backend (Node.js)
- Express
- MongoDB driver
- WebSocket

#### Backend (Python)
- FastAPI 0.115.5
- pymongo 4.6.0
- Uvicorn
- LangChain (RAG)
- OpenAI API

---

## TDD 도입 전략

### Phase 1: 테스트 인프라 구축 (1주차)

#### 필요한 패키지 설치

```bash
# Frontend 테스트 도구
npm install --save-dev @testing-library/react @testing-library/jest-dom 
npm install --save-dev @testing-library/user-event
npm install --save-dev msw  # API 모킹
npm install --save-dev cypress  # E2E 테스트

# Node.js API 테스트 도구
npm install --save-dev jest supertest
npm install --save-dev mongodb-memory-server  # 인메모리 MongoDB

# Python 테스트 도구
pip install pytest pytest-asyncio httpx pytest-mock mongomock
```

### Phase 2: 테스트 구조 설정 (1-2주차)

#### 제안하는 테스트 디렉토리 구조

```
tests/
├── unit/                      # 단위 테스트
│   ├── frontend/
│   ├── backend/
│   └── python/
│
├── integration/              # 통합 테스트
│   ├── api/
│   └── services/
│
├── e2e/                     # End-to-End 테스트
│   ├── customer-flow/
│   └── document-flow/
│
├── fixtures/                # 테스트 데이터
│   ├── customers.json
│   └── relationships.json
│
└── setup/                   # 테스트 설정
    ├── jest.config.js
    ├── pytest.ini
    └── test-utils.js
```

### Phase 3: 핵심 기능 테스트 작성 (2-4주차)

#### 우선순위 높은 테스트 대상

1. **고객 관계 관리** (최근 버그 발생 영역)
   - 관계 생성/수정/삭제
   - 실시간 뷰 업데이트
   - 양방향 관계 처리

2. **문서 처리 파이프라인**
   - 업로드 → OCR → 태깅 → 저장

3. **RAG 검색 기능**
   - 벡터 검색 정확도
   - LLM 응답 품질

---

## 테스트 인프라 구축

### 통합 테스트 환경 (docker-compose.test.yml)

```yaml
version: '3.8'

services:
  # 테스트용 데이터베이스
  mongodb-test:
    image: mongo:5.0
    environment:
      MONGO_INITDB_DATABASE: aims_test
    ports:
      - "27018:27017"  # 테스트용 별도 포트
  
  qdrant-test:
    image: qdrant/qdrant
    ports:
      - "6334:6333"  # 테스트용 별도 포트
  
  # 테스트 러너
  test-runner:
    build: ./tests
    volumes:
      - .:/app
    environment:
      NODE_ENV: test
      MONGODB_URI: mongodb://mongodb-test:27017/aims_test
      QDRANT_URL: http://qdrant-test:6333
    command: |
      bash -c "
        npm test
        pytest
        npx cypress run
      "
```

### CI/CD 파이프라인 (GitHub Actions)

```yaml
name: AIMS Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:5.0
        ports:
          - 27017:27017
      
      qdrant:
        image: qdrant/qdrant
        ports:
          - 6333:6333
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install dependencies
        run: |
          npm ci
          pip install -r requirements.txt
      
      - name: Run tests
        run: |
          npm test -- --coverage
          pytest --cov
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 우선순위 및 로드맵

### 🔴 즉시 해야 할 일 (1일 내)

1. **중복 파일 정리**
   ```bash
   # 중복 테스트 스크립트 통합
   scripts/create_test_customers.js + create-test-customers.js 
   → scripts/setup-test-data.js
   ```

2. **기본 테스트 구조 생성**
   ```bash
   mkdir -p tests/{unit,integration,e2e,fixtures,setup}
   ```

3. **첫 번째 테스트 작성**
   - 관계 생성 후 이벤트 발생 테스트

### 🟡 이번 주 내

1. **환경 설정 통합**
   - 모든 환경 변수를 `.env.test` 파일로 통합
   - docker-compose.test.yml 작성

2. **CI/CD 파이프라인 설정**
   - GitHub Actions 워크플로우 구성
   - 자동 테스트 실행

3. **테스트 커버리지 목표 설정**
   - 초기 목표: 60%
   - 핵심 기능 우선

### 🟢 이번 달 내

1. **구조 리팩토링**
   - monorepo 구조로 전환 고려
   - 공통 라이브러리 분리

2. **문서화**
   - API 문서 자동 생성
   - 테스트 가이드 작성

3. **테스트 커버리지 80% 달성**
   - 모든 핵심 기능 커버
   - E2E 시나리오 완성

---

## 실행 가능한 첫 테스트

### 1. RelationshipService 이벤트 시스템 테스트

```javascript
// frontend/aims-uix1/src/services/__tests__/RelationshipService.test.js

import RelationshipService from '../RelationshipService';

describe('RelationshipService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RelationshipService.cache.clear();
  });

  describe('createRelationship', () => {
    it('should dispatch relationshipChanged event on success', async () => {
      // Given
      const mockResponse = { 
        success: true, 
        data: { id: '123', relationship_type: 'spouse' } 
      };
      
      global.fetch = jest.fn(() => 
        Promise.resolve({
          json: () => Promise.resolve(mockResponse)
        })
      );
      
      const eventSpy = jest.fn();
      window.addEventListener('relationshipChanged', eventSpy);
      
      // When
      await RelationshipService.createRelationship(
        'customer1', 
        'customer2', 
        { relationship_type: 'spouse' }
      );
      
      // Then
      expect(eventSpy).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/customers/customer1/relationships'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('customer2')
        })
      );
      
      // Cleanup
      window.removeEventListener('relationshipChanged', eventSpy);
    });

    it('should invalidate cache after creating relationship', async () => {
      // Test implementation
    });
  });
});
```

### 2. 고객 관계 E2E 테스트

```javascript
// tests/e2e/customer-relationship.spec.js

const { test, expect } = require('@playwright/test');

test.describe('Customer Relationship Management', () => {
  test('관계 생성 후 모든 뷰 자동 업데이트', async ({ page }) => {
    // 1. 고객 관리 페이지로 이동
    await page.goto('http://localhost:3005');
    
    // 2. 곽승철 고객 선택
    await page.click('text=곽승철');
    
    // 3. 가족관계 버튼 클릭
    await page.click('button:has-text("가족관계")');
    
    // 4. 송유미를 검색하고 배우자로 선택
    await page.fill('[data-testid="family-search"]', '송유미');
    await page.selectOption('[data-testid="relationship-type"]', 'spouse');
    await page.click('button:has-text("가족 관계 추가")');
    
    // 5. 성공 메시지 확인
    await expect(page.locator('text=관계가 생성되었습니다')).toBeVisible();
    
    // 6. 관계별 보기로 전환
    await page.click('text=관계별 보기');
    
    // 7. 로딩 없이 즉시 업데이트 확인
    await expect(page.locator('text=고객 관계 데이터를 불러오는 중')).not.toBeVisible();
    await expect(page.locator('text=곽승철 (대표)')).toBeVisible();
    await expect(page.locator('text=송유미')).toBeVisible();
  });
});
```

### 3. Python API 테스트

```python
# api/doc_status_api/tests/test_document_api.py

import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock
from main import app

@pytest.mark.asyncio
async def test_document_upload_and_processing():
    """문서 업로드 및 처리 파이프라인 테스트"""
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        # 1. 문서 업로드
        files = {
            "file": ("test.pdf", b"fake pdf content", "application/pdf")
        }
        response = await client.post("/upload", files=files)
        
        assert response.status_code == 200
        document_id = response.json()["document_id"]
        
        # 2. 처리 상태 확인
        status_response = await client.get(f"/documents/{document_id}/status")
        assert status_response.json()["status"] in ["processing", "completed"]
        
        # 3. OCR 결과 확인
        with patch('dococr.extract_text') as mock_ocr:
            mock_ocr.return_value = "Sample text from PDF"
            
            ocr_response = await client.get(f"/documents/{document_id}/text")
            assert "Sample text" in ocr_response.json()["text"]
```

---

## 테스트 실행 명령어

### 개발 중 테스트

```bash
# Frontend 테스트
cd frontend/aims-uix1
npm test                    # 감시 모드
npm test -- --coverage      # 커버리지 포함
npm test RelationshipService # 특정 파일만

# Backend (Node.js) 테스트
cd api/aims_api
npm test
npm run test:watch

# Backend (Python) 테스트
cd api/doc_status_api
pytest
pytest -v --cov            # 커버리지 포함
pytest tests/test_api.py   # 특정 파일만

# E2E 테스트
npx playwright test
npx playwright test --headed  # 브라우저 보면서 테스트
```

### CI/CD 테스트

```bash
# 모든 테스트 실행
make test

# Docker로 통합 테스트
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

---

## 테스트 작성 가이드라인

### 1. 테스트 명명 규칙

```javascript
// ✅ Good
describe('RelationshipService', () => {
  describe('createRelationship', () => {
    it('should create a new relationship and emit event', () => {});
    it('should handle API errors gracefully', () => {});
  });
});

// ❌ Bad
test('test1', () => {});
test('relationship test', () => {});
```

### 2. AAA 패턴 (Arrange-Act-Assert)

```javascript
it('should update relationship tree on creation', () => {
  // Arrange (준비)
  const mockData = createMockRelationship();
  
  // Act (실행)
  const result = RelationshipService.create(mockData);
  
  // Assert (검증)
  expect(result).toBeDefined();
  expect(eventBus.emit).toHaveBeenCalledWith('relationshipChanged');
});
```

### 3. 테스트 격리

- 각 테스트는 독립적이어야 함
- 테스트 순서에 의존하지 않음
- 테스트 후 정리(cleanup) 필수

---

## 참고 자료

- [Jest Documentation](https://jestjs.io/)
- [Pytest Documentation](https://docs.pytest.org/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)

---

*작성일: 2025-09-06*
*작성자: AIMS 개발팀*