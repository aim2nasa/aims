# AIMS 상업적 완성도 평가 스킬

## 트리거
- `/readiness`
- "상업적 완성도", "commercial readiness"

## 실행 절차

### Phase 1: 런타임 데이터 수집 (병렬)

다음 4개를 **동시에** 실행한다:

**1-A. 서버 상태**
```bash
ssh rossi@100.110.215.65 'pm2 list && echo "---" && df -h / && free -h && uptime && docker ps --format "table {{.Names}}\t{{.Status}}"'
```

**1-B. DB 통계**
```bash
ssh rossi@100.110.215.65 'docker exec aims-api node -e "
const { MongoClient } = require(\"mongodb\");
const client = new MongoClient(\"mongodb://tars:27017\");
client.connect().then(async () => {
  const db = client.db(\"docupload\");
  const adb = client.db(\"aims_analytics\");
  // docupload 통계
  const stats = await db.stats();
  const users = await db.collection(\"users\").countDocuments();
  const customers = await db.collection(\"customers\").countDocuments();
  const files = await db.collection(\"files\").countDocuments();
  const ic = await db.collection(\"insurance_contracts\").countDocuments();
  const custAR = await db.collection(\"customers\").countDocuments({annual_reports: {\$exists: true, \$ne: []}});
  const custCR = await db.collection(\"customers\").countDocuments({customer_reviews: {\$exists: true, \$ne: []}});
  const creditPkg = await db.collection(\"credit_packages\").countDocuments();
  const creditTx = await db.collection(\"credit_transactions\").countDocuments();
  console.log(JSON.stringify({dbSizeMB: (stats.dataSize/1024/1024).toFixed(1), collections: stats.collections, users, customers, files, insurance_contracts: ic, custAR, custCR, creditPkg, creditTx}));
  // analytics 통계
  const aColls = await adb.listCollections().toArray();
  for (const c of aColls) {
    const count = await adb.collection(c.name).countDocuments();
    console.log(c.name + \":\" + count);
  }
  client.close();
});
"'
```

**1-C. 보안 점검**
```bash
ssh rossi@100.110.215.65 'echo "=== BACKUP ===" && ls -la /data/backup/aims_backup_*.tar.gz 2>/dev/null | tail -3 && echo "=== CRON ===" && crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" && echo "=== NGINX ===" && grep -i "limit_req\|helmet\|rate" /etc/nginx/sites-available/* /etc/nginx/nginx.conf 2>/dev/null'
```

**1-D. 코드 보안 점검**
- admin-routes.js에서 `authenticateJWT` 없는 라우트 확인
- server.js에서 helmet, rate-limit 패키지 확인
- auth.js에서 admin-login 비밀번호 구현 여부 확인

### Phase 2: 코드 분석 (서브에이전트 병렬)

다음을 Explore 서브에이전트로 병렬 실행:
1. 프론트엔드 기능 모듈 수 / 라우트 수 / 컴포넌트 수
2. 백엔드 서비스별 에러 핸들링, 헬스체크, 테스트 수
3. 테스트 파일 수, CI 워크플로우 수

### Phase 3: 평가 및 문서 생성

수집된 데이터로 다음 영역별 점수를 매긴다:

| 영역 | 평가 기준 |
|------|----------|
| 기능 완성도 | 핵심 모듈 완성 여부, 실 데이터 존재 여부 |
| 인프라/운영 | 서버 안정성, 백업, 모니터링, 리소스 여유 |
| 보안 | 인증, 인가, Rate Limit, 보안 헤더, 취약점 |
| 테스트/품질 | 테스트 수, CI/CD, TypeScript, 커버리지 |
| 비즈니스 준비도 | 결제, 온보딩, SLA, 고객지원 |

### Phase 4: 문서 업데이트

`docs/COMMERCIAL_READINESS.md` 파일을 최신 데이터로 **전체 갱신**한다.

**필수 포함 항목:**
- 분석일 (오늘 날짜)
- 종합 점수
- 영역별 점수 + 상세 테이블
- 실 사용 현황 (analytics DB 수치)
- 서버 리소스 현황
- 해결 우선순위 (P0~P3)
- 이전 분석과의 변화 (점수 증감, 해결된 항목)
- 검증 이력

### Phase 5: 변화 요약

이전 분석 대비 변화를 사용자에게 간결하게 보고한다:
- 점수 변동 (상승/하락/유지)
- 새로 해결된 항목
- 새로 발견된 문제
- 다음 우선 조치 사항

## 주의사항

- **Rule 0-0 (답변 검증 원칙)** 엄격 적용: 모든 수치는 실제 런타임에서 검증
- 코드 default 값을 실제 값으로 오인하지 않는다
- 서브에이전트 결과는 런타임 데이터로 교차 검증한다
- 불확실한 항목은 "확인 필요"로 표기한다
