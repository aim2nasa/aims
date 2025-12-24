# aims_mcp 테스트 가이드

## 테스트 스크립트

| 명령어 | 설명 | 서버 필요 |
|--------|------|----------|
| `npm test` | 유닛 테스트 | ❌ |
| `npm run test:e2e` | 사용자 시뮬레이션 E2E | ✅ MCP |
| `npm run test:e2e:cross-system` | Cross-system E2E | ✅ MCP + API |
| `npm run test:e2e:all` | 모든 E2E | ✅ 전체 |
| `npm run test:all` | 유닛 + E2E 전체 | ⚠️ |

## 사용 시나리오

### 로컬 개발 (서버 없음)
```bash
npm test
```

### 배포 전 전체 검증
```bash
npm run test:all
```
> E2E는 서버 없으면 자동 스킵됨

### 원격 서버 대상 E2E
```bash
MCP_URL=http://tars.giize.com:3011 AIMS_API_URL=http://tars.giize.com:3010 npm run test:e2e:all
```

### 서버에서 직접 실행
```bash
ssh tars.giize.com
cd ~/aims/backend/api/aims_mcp
npm run test:e2e:all
```

## E2E 테스트 특징

- 서버 미연결 시 테스트 **스킵** (실패 아님)
- 실제 데이터베이스 연동
- 테스트 데이터 자동 정리 (afterEach)
