# AIMS 스크립트 사용 가이드

## 📋 목차
- [고객 생성 스크립트](#고객-생성-스크립트)
- [고객 삭제 스크립트](#고객-삭제-스크립트)

---

## 🚀 고객 생성 스크립트

### 파일명
`generate_customers.js`

### 기능
랜덤 고객 데이터를 생성하여 AIMS 시스템에 등록합니다.

### 사용법
```bash
node generate_customers.js [개인고객수] [법인고객수]
```

**⚠️ 중요: 두 개의 인자는 필수입니다!**

### 예시
```bash
# 개인 70명, 법인 30명 생성
node generate_customers.js 70 30

# 개인 고객만 100명 생성
node generate_customers.js 100 0

# 법인 고객만 50명 생성
node generate_customers.js 0 50

# 대량 생성: 개인 200명, 법인 100명
node generate_customers.js 200 100
```

### 생성되는 데이터
#### 개인 고객
- ✅ 랜덤 한국 이름 (중복 최소화)
- ✅ 생년월일 (20세~80세)
- ✅ 성별 (남/여)
- ✅ 휴대폰 번호
- ✅ 집 전화번호 (50% 확률)
- ✅ 회사 전화번호 (30% 확률)
- ✅ 이메일 주소
- ✅ 서울 지역 주소 (우편번호 포함)
- ✅ 위험등급 (저/중/고위험)
- ✅ 연간 보험료
- ✅ 총 보장액

#### 법인 고객
- ✅ 랜덤 법인명 (예: 한국건설(주), 대한무역그룹)
- ✅ 대표 전화번호
- ✅ 이메일 주소
- ✅ 사업장 주소
- ✅ 위험등급
- ✅ 연간 보험료 (개인보다 3배 높음)
- ✅ 총 보장액 (개인보다 5배 높음)

### 실행 결과
- 실시간 진행 상황 표시
- 성공/실패 건수 카운트
- 완료 후 상세 리포트 출력
- 실패 건 상세 내역 제공

---

## 🗑️ 고객 삭제 스크립트

### 파일명
`delete_customers.js`

### 기능
특정 조건에 맞는 고객을 삭제합니다.

### 사용법

#### 1. 전체 고객 삭제
```bash
node delete_customers.js --all
```

#### 2. 특정 고객 삭제 (ID로)
```bash
node delete_customers.js --id [고객ID]
```

#### 3. 유형별 삭제
```bash
# 개인 고객만 삭제
node delete_customers.js --type 개인

# 법인 고객만 삭제
node delete_customers.js --type 법인
```

#### 4. 확인 없이 즉시 삭제
```bash
# 전체 삭제 (확인 프롬프트 없이)
node delete_customers.js --all --confirm

# 개인 고객 즉시 삭제
node delete_customers.js --type 개인 --confirm

# 법인 고객 즉시 삭제
node delete_customers.js --type 법인 --confirm
```

### 예시

```bash
# 전체 고객 삭제 (확인 필요)
node delete_customers.js --all

# 특정 고객 삭제
node delete_customers.js --id 68e4941a978867428a9bfff6

# 개인 고객만 삭제 (확인 필요)
node delete_customers.js --type 개인

# 법인 고객 즉시 삭제 (확인 없이)
node delete_customers.js --type 법인 --confirm
```

### 안전 기능
- ✅ 삭제 전 고객 정보 미리보기
- ✅ 사용자 확인 프롬프트 (기본값)
- ✅ `--confirm` 플래그로 확인 생략 가능
- ✅ 배치 처리로 API 과부하 방지 (10개씩)
- ✅ 성공/실패 상세 리포트

### 실행 결과
- 삭제 대상 고객 정보 미리보기
- 실시간 삭제 진행 상황
- 성공/실패 건수 통계
- 실패 건 상세 오류 메시지

---

## 🔧 사전 준비

### 1. 의존성 설치
```bash
cd scripts
npm install
```

### 2. API 서버 확인
- API 서버가 `http://tars.giize.com:3010`에서 실행 중이어야 합니다
- `/api/customers` 엔드포인트가 정상 작동해야 합니다

---

## 📊 실전 시나리오

### 시나리오 1: 테스트 데이터 생성 및 정리
```bash
# 1. 테스트용 소량 데이터 생성
node generate_customers.js 10 5

# 2. 확인 후 삭제
node delete_customers.js --all
```

### 시나리오 2: 대량 데이터 생성
```bash
# 개인 500명, 법인 200명 생성
node generate_customers.js 500 200
```

### 시나리오 3: 유형별 관리
```bash
# 1. 법인 고객만 100명 생성
node generate_customers.js 0 100

# 2. 법인 고객만 삭제
node delete_customers.js --type 법인 --confirm
```

### 시나리오 4: 데이터 리셋
```bash
# 전체 삭제 후 새로 생성
node delete_customers.js --all --confirm
node generate_customers.js 70 30
```

---

## ⚠️ 주의사항

### 고객 생성 스크립트
- API 과부하 방지를 위해 각 요청 간 100ms 딜레이 적용
- 대량 생성 시 시간이 오래 걸릴 수 있음 (100명 ≈ 10초)
- 네트워크 오류 발생 시 실패 건 재시도 필요

### 고객 삭제 스크립트
- `--confirm` 플래그 사용 시 확인 없이 즉시 삭제됨 (주의!)
- 삭제된 데이터는 복구 불가능 (소프트 삭제 아님)
- 배치 처리로 10개씩 삭제 (API 부하 분산)

---

## 🐛 문제 해결

### axios 모듈 오류
```bash
Error: Cannot find module 'axios'
```
**해결:** `cd scripts && npm install`

### API 연결 오류
```bash
connect ETIMEDOUT
```
**해결:**
1. API 서버 실행 상태 확인
2. 네트워크 연결 확인
3. 방화벽 설정 확인

### 경로 오류
```bash
Error: Cannot find module 'D:\aims\scripts\scripts\...'
```
**해결:** `scripts` 디렉토리 내에서 실행 시 `scripts/` 경로 제거
```bash
# 올바른 실행 방법
cd scripts
node generate_customers.js 70 30
```

---

## 📝 변경 이력

### v1.0.0 (2025-10-07)
- ✅ 고객 생성 스크립트 추가
- ✅ 고객 삭제 스크립트 추가
- ✅ 명령줄 인자 기반 실행
- ✅ API 연동 및 오류 처리
