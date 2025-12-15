# 배포 일관성 보장 가이드

## 개요

프로덕션 서버와 개발 서버의 결과가 항상 동일하게 보장되어야 합니다. 이 문서는 2025-12-16에 발생한 불일치 문제를 분석하고 해결 방안을 정리합니다.

---

## 발생한 문제 (2025-12-16)

### 증상

| 환경 | 결과 |
|------|------|
| 프로덕션 (aims.giize.com) | 송유미 - 0원, 0건 (배지 없음) |
| 개발서버 (localhost:5177) | 송유미 - 실패 배지 표시 |

### 근본 원인

1. **프론트엔드 배포 지연**: 프로덕션에 최신 코드가 배포되지 않음
2. **scp 사용 시 이전 파일 미삭제**: 구버전 번들 파일이 서버에 잔존
3. **프론트엔드 fallback 버그**: `customer_name`이 null이면 고객명으로 잘못 대체

```
문제 흐름:
┌─────────────────────────────────────────────────────────────┐
│ 1. 백엔드: "annual report" 패턴 미인식 → customer_name: null │
│ 2. 프론트: null → customer.name("송유미")로 fallback        │
│ 3. 프론트: status 필드 무시 → 0원, 0건 표시 (배지 없음)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 해결 방안

### 1. GitHub Actions 자동 배포 (권장)

`deploy-with-tests.yml` 워크플로우 사용:

```yaml
# 핵심: rsync --delete 옵션
rsync -avz --delete \
  frontend/aims-uix3/dist/ \
  ${{ vars.SERVER_USER }}@${{ vars.SERVER_HOST }}:/home/rossi/aims/frontend/aims-uix3/dist/
```

**장점:**
- `--delete` 옵션으로 이전 파일 자동 삭제
- 항상 fresh checkout으로 빌드
- 테스트 통과 후에만 배포

**배포 흐름:**
```
GitHub에 push → Actions 페이지 → "Deploy with Full Tests" 수동 실행
                                         ↓
                              1. 프론트엔드 테스트 ─┐
                              2. 백엔드 테스트 ────┼→ 모두 통과
                              3. Python 테스트 ───┘
                                         ↓
                              4. 빌드 + rsync --delete → tars 서버
```

### 2. 수동 배포 시 체크리스트

| 단계 | 명령 | 목적 |
|------|------|------|
| 1. 빌드 | `npm run build` | 최신 코드 컴파일 |
| 2. 정리 | `ssh tars 'rm -rf dist/*'` | 서버 구버전 삭제 |
| 3. 업로드 | `scp -r dist/* tars:...` | 새 버전 업로드 |
| 4. 검증 | 해시 비교 | 동일성 확인 |

### 3. 배포 후 검증 방법

```bash
# 백엔드 파일 해시 비교
md5sum d:/aims/backend/api/.../db_writer.py
ssh tars "md5sum /home/rossi/aims/backend/api/.../db_writer.py"

# 프론트엔드 번들 확인
grep -o 'index-[^.\"]*\.js' d:/aims/frontend/aims-uix3/dist/index.html
ssh tars "grep -o 'index-[^.\"]*\.js' /home/rossi/aims/frontend/aims-uix3/dist/index.html"
```

---

## 수정된 코드

### 1. 백엔드: 파일명 패턴 확장

**파일:** `backend/api/annual_report_api/services/db_writer.py`

```python
# 이전
match = re.match(r'^(.+?)보유계약현황', filename)

# 수정 후
patterns = [
    r'^(.+?)보유계약현황',           # 홍길동보유계약현황202508.pdf
    r'^(.+?)[Aa]nnual\s*[Rr]eport',  # 안영미annual report202508.pdf
]
for pattern in patterns:
    match = re.match(pattern, filename, re.IGNORECASE)
    if match:
        customer_name_from_filename = match.group(1).strip()
        break
```

### 2. 프론트엔드: 잘못된 fallback 제거

**파일:** `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx`

```typescript
// 이전 (버그)
customer_name: rawData.customer_name || customer.personal_info?.name || ''

// 수정 후
// AR 문서의 소유주는 고객과 다를 수 있음 (예: 가족의 AR 문서)
customer_name: rawData.customer_name || ''
```

---

## 관련 커밋

- `8cd3878f` - fix: AR 파싱 소유주명 표시 오류 수정

---

## 참고 문서

- [CI/CD 워크플로우](.github/workflows/deploy-with-tests.yml)
- [프론트엔드 배포](.github/workflows/deploy-frontend.yml)
