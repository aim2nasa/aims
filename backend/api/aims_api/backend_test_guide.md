# 🧪 백엔드 API 수정 후 검증 및 테스트 가이드

## 📋 수정 작업 체크리스트

### 1️⃣ 백엔드 수정 사항 적용

**파일**: `/home/rossi/aims/backend/api/aims_api/server.js`

**적용해야 할 수정사항**:
- [ ] 한글 검색 문제 수정 (`backend_fix_korean_search.js` 참고)
- [ ] 파일 크기 정렬 문제 수정 (`backend_fix_size_sorting.js` 참고)

### 2️⃣ 서버 재시작

```bash
# tars 서버에서 실행
cd /home/rossi/aims/backend/api/aims_api
npm start
```

### 3️⃣ 수정 전후 비교 테스트

## 🔍 한글 검색 테스트

### Before (수정 전 - 실패)
```bash
curl -s "http://tars.giize.com:3010/api/documents?search=캐치업&limit=5" | jq '.data.pagination.totalCount'
# 결과: 0 (실패)

curl -s "http://tars.giize.com:3010/api/documents?search=정관&limit=5" | jq '.data.pagination.totalCount' 
# 결과: 0 (실패)
```

### After (수정 후 - 성공 예상)
```bash
curl -s "http://tars.giize.com:3010/api/documents?search=캐치업&limit=5" | jq '.data.pagination.totalCount'
# 예상 결과: 12 이상 (성공)

curl -s "http://tars.giize.com:3010/api/documents?search=정관&limit=5" | jq '.data.pagination.totalCount'
# 예상 결과: 1 이상 (성공)

# 실제 검색된 파일명들 확인
curl -s "http://tars.giize.com:3010/api/documents?search=캐치업&limit=5" | jq '.data.documents[] | .filename'
# 예상 결과: 
# "(주)캐치업코리아 2025. 02월 퇴직연금 부담금 내역.xls"
# "캐치업상품설명서.pdf"
# "캐치업청약서 (1).pdf"
# 등등...
```

## 📊 파일 크기 정렬 테스트

### Before (수정 전 - 잘못된 순서)
```bash
curl -s "http://tars.giize.com:3010/api/documents?sort=size_desc&limit=3" | jq '.data.documents[] | {filename: .filename, fileSize: .fileSize}'
# 실제 결과 (잘못됨):
# {"filename": "캐치업사업비내역서.pdf", "fileSize": "92126"}
# {"filename": "(완료)등기부등본_(주)캐치업코리아_250326.pdf", "fileSize": "75032"}
# {"filename": "캐치업코리아-자필서류-20240813.pdf", "fileSize": "746567"}
```

### After (수정 후 - 올바른 순서 예상)
```bash
curl -s "http://tars.giize.com:3010/api/documents?sort=size_desc&limit=3" | jq '.data.documents[] | {filename: .filename, fileSize: .fileSize}'
# 예상 결과 (올바른 순서):
# {"filename": "캐치업상품설명서.pdf", "fileSize": "4314554"}  # 가장 큰 파일
# {"filename": "캐치업청약서 (1).pdf", "fileSize": "3641428"}   # 두 번째로 큰 파일
# {"filename": "마장사은품.pptx", "fileSize": "1630085"}        # 세 번째로 큰 파일

curl -s "http://tars.giize.com:3010/api/documents?sort=size_asc&limit=3" | jq '.data.documents[] | {filename: .filename, fileSize: .fileSize}'
# 예상 결과 (오름차순):
# {"filename": "유아영.xlsx", "fileSize": "16174"}             # 가장 작은 파일
# {"filename": "김보성 종신제안.xlsx", "fileSize": "24469"}    # 두 번째로 작은 파일
# {"filename": "정관_캐치업코리아.hwp", "fileSize": "31232"}   # 세 번째로 작은 파일
```

## 🎯 성공 기준

### ✅ 한글 검색 성공 기준
1. **"캐치업" 검색**: 12개 이상의 파일 결과
2. **"정관" 검색**: 1개 이상의 파일 결과 (정관_캐치업코리아.hwp)
3. **검색 결과 정확성**: 실제로 해당 키워드가 포함된 파일들만 반환

### ✅ 크기 정렬 성공 기준
1. **size_desc**: 큰 파일부터 작은 파일 순서로 정렬
2. **size_asc**: 작은 파일부터 큰 파일 순서로 정렬
3. **숫자 정렬**: 문자열 정렬이 아닌 실제 숫자 값으로 정렬

## 🚨 문제 발생 시 디버깅

### 로그 확인
```bash
# 서버 로그에서 다음 메시지들 확인:
# "🔍 검색 요청 - 원본: ..."
# "📝 디코딩 완료: ..."
# "🎯 MongoDB 쿼리: ..."
# "📊 크기 정렬 요청: ..."
# "📈 크기 정렬 결과 개수: ..."
```

### 추가 테스트 명령어
```bash
# 1. 영문 검색 정상 작동 확인 (기존에 작동하던 것)
curl -s "http://tars.giize.com:3010/api/documents?search=pdf&limit=3" | jq '.data.pagination.totalCount'
# 예상: 18

# 2. 일반 정렬 정상 작동 확인
curl -s "http://tars.giize.com:3010/api/documents?sort=filename_asc&limit=3" | jq '.data.documents[] | .filename'
# 예상: 파일명 오름차순 정렬

# 3. 복합 조건 테스트
curl -s "http://tars.giize.com:3010/api/documents?search=캐치업&sort=size_desc&limit=3" | jq '.data.documents[] | {filename: .filename, fileSize: .fileSize}'
# 예상: 캐치업 포함 파일들이 크기 내림차순으로 정렬
```

## 📊 성능 확인

### 응답 시간 측정
```bash
# 수정 전후 응답 시간 비교
time curl -s "http://tars.giize.com:3010/api/documents?search=캐치업&limit=10" > /dev/null
time curl -s "http://tars.giize.com:3010/api/documents?sort=size_desc&limit=10" > /dev/null

# 기대 결과: 0.3초 이내 (기존과 비슷한 수준)
```

## 🎉 최종 검증 체크리스트

- [ ] 한글 검색 "캐치업": 12개 이상 결과 반환
- [ ] 한글 검색 "정관": 1개 이상 결과 반환  
- [ ] 크기 내림차순 정렬: 큰 파일부터 올바른 순서
- [ ] 크기 오름차순 정렬: 작은 파일부터 올바른 순서
- [ ] 기존 영문 검색 정상 작동: "pdf" 검색 시 18개 결과
- [ ] 기존 파일명 정렬 정상 작동: filename_asc/desc
- [ ] 복합 조건 정상 작동: 한글검색 + 크기정렬
- [ ] 응답 시간 유지: 0.5초 이내
- [ ] 에러 없이 정상 응답: success: true

**모든 항목이 체크되면 수정 성공! ✅**