# AI 어시스턴트 AR 문서 처리 흐름

## 개요

AI 어시스턴트(ChatPanel)에서 AR(Annual Report) 문서를 업로드할 때의 처리 흐름을 설명합니다.
이 흐름은 **새문서등록(DocumentRegistrationView)**과 동일한 메카니즘을 사용합니다.

## 처리 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI 어시스턴트 AR 문서 처리                         │
└─────────────────────────────────────────────────────────────────────────┘

1. 파일 선택 (열기 버튼 클릭)
         │
         ▼
2. 이전 대화에서 고객명 추출
         │  예: "김보성 문서 업로드해줘" → "김보성" 추출
         │
         ▼
3. 고객 검색 (CustomerService.getCustomers)
         │  → targetCustomerId 확보
         │
         ▼
4. PDF AR 감지 (checkAnnualReportFromPDF)
         │  → is_annual_report, metadata 확인
         │
         ▼
5. n8n webhook 업로드
         │  - URL: https://n8nd.giize.com/webhook/docprep-main
         │  - FormData: file, userId, customerId
         │  → n8n이 MongoDB에 문서 저장 + customerId 연결
         │
         ▼
6. 2초 대기 (n8n 처리 완료 대기)
         │
         ▼
7. AR 플래그 설정 (/api/documents/set-annual-report)
         │  - filename, metadata, customer_id 전송
         │  → is_annual_report = true 설정
         │  → documentId 반환
         │
         ▼
8. 문서 처리 완료 대기 (waitForDocumentProcessing)
         │  - SSE 기반 (EventSource)
         │  - 최대 3분 타임아웃
         │  - processing-complete 이벤트 수신 대기
         │
         ▼
9. AR 파싱 트리거 (/api/ar-background/trigger-parsing)
         │  - customer_id, file_id 전송
         │  → 백그라운드에서 AR 파싱 시작
         │
         ▼
10. 업로드 완료 메시지 표시
         └─ "✅ {고객명} 고객에게 문서가 업로드되었습니다."
```

## 핵심 함수

### 1. handleFileSelect (ChatPanel.tsx)
파일 선택 즉시 업로드 시작. 고객명 추출 → 업로드 → AR 처리 전체 흐름 담당.

### 2. checkAnnualReportFromPDF (pdfParser.ts)
PDF 첫 페이지를 분석하여 AR 여부 판정.
- "보유계약현황" 키워드 검사
- metadata: report_title, issue_date 추출

### 3. waitForDocumentProcessing (waitForDocumentProcessing.ts)
SSE(Server-Sent Events)로 문서 OCR 처리 완료를 대기.
- 연결: `/api/documents/{documentId}/status/stream`
- 이벤트: `connected`, `processing-complete`, `timeout`, `ping`
- 타임아웃: 3분 (180,000ms)

## 관련 API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/webhook/docprep-main` | POST | n8n 파일 업로드 |
| `/api/documents/set-annual-report` | PATCH | AR 플래그 + 고객 연결 설정 |
| `/api/documents/{id}/status/stream` | GET (SSE) | 문서 처리 상태 스트림 |
| `/api/ar-background/trigger-parsing` | POST | AR 파싱 백그라운드 시작 |

## 새문서등록과의 비교

| 기능 | AI 어시스턴트 | 새문서등록 |
|------|--------------|----------|
| 고객 선택 | 대화에서 자동 추출 | UI에서 직접 선택 |
| AR 감지 | checkAnnualReportFromPDF | 동일 |
| 업로드 | n8n webhook | 동일 |
| AR 플래그 | set-annual-report | 동일 |
| 처리 대기 | waitForDocumentProcessing | 동일 |
| 파싱 트리거 | ar-background/trigger-parsing | 동일 |

## 주의사항

1. **고객명 필수**: 대화에서 고객명을 찾지 못하면 업로드 취소
2. **SSE 대기 필수**: AR 파싱은 문서 처리 완료 후에만 트리거
3. **중복 방지**: arFilenamesRef로 같은 파일 중복 처리 방지

## 관련 파일

- `frontend/aims-uix3/src/components/ChatPanel/ChatPanel.tsx`
- `frontend/aims-uix3/src/shared/lib/waitForDocumentProcessing.ts`
- `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts`
- `backend/api/aims_api/server.js` (set-annual-report 엔드포인트)

---

*작성일: 2025-12-28*
*커밋: f2221d70*
