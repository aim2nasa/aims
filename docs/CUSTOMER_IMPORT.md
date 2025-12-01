# 고객 가져오기 (Customer Import)

## 개요
엑셀 파일에서 개인/법인 고객을 일괄 등록하는 기능

## 엑셀 형식
| 시트명 | 컬럼 |
|--------|------|
| 개인고객명단 | 고객명, 연락처, 주소, 성별, 생년월일 |
| 법인고객명단 | 고객명, 연락처, 주소 |

## 핵심 로직
- 고객명 = 계약 연결 Key
- 동일 고객명 존재 시 → 정보 업데이트 (생성 안함)
- 변경사항 없으면 → 건너뜀

## 워크플로우
```
파일 업로드 → 검증/미리보기 → 등록 → 결과 표시
```

## 메뉴 위치
빠른 작업 > 새 고객 등록 > 새문서 등록 > **고객 가져오기** > 계약 가져오기

아이콘: `person-2-fill` (파란색)

---

## 파일 목록

### Frontend
| 파일 | 설명 |
|------|------|
| `CustomerViews/CustomerImportView/CustomerImportView.tsx` | 페이지 래퍼 |
| `CustomerViews/CustomerImportView/components/CustomerExcelImporter.tsx` | 핵심 컴포넌트 |
| `services/customerService.ts` | bulkImportCustomers API |

### Backend
| 파일 | 설명 |
|------|------|
| `server.js` | POST /api/customers/bulk (line 2092-2263) |

---

## API

### POST /api/customers/bulk
```json
// Request
{
  "customers": [
    {
      "name": "홍길동",
      "customer_type": "개인",
      "mobile_phone": "010-2345-5678",
      "address": "경기도 고양시...",
      "gender": "남",
      "birth_date": "1990-12-23"
    }
  ]
}

// Response
{
  "success": true,
  "message": "5건 등록, 3건 업데이트, 1건 건너뜀",
  "data": {
    "createdCount": 5,
    "updatedCount": 3,
    "skippedCount": 1,
    "errorCount": 0,
    "created": [{ "name": "...", "_id": "..." }],
    "updated": [{ "name": "...", "_id": "...", "changes": ["연락처"] }],
    "skipped": [{ "name": "...", "reason": "변경사항 없음" }],
    "errors": []
  }
}
```

---

## 구현 상태

| 항목 | 상태 |
|------|------|
| Backend API | ✅ 배포 완료 |
| Frontend 컴포넌트 | ✅ 구현 완료 |
| 메뉴 연동 | ✅ 완료 |
| 타입체크 | ✅ 통과 |

## 구현 일자
2025-12-01
