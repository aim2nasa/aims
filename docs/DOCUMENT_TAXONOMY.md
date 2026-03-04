# AIMS 표준 문서 분류 체계

> **버전**: 1.0 | **최종 수정**: 2026-03-05 | **상태**: 초안

## 개요

보험 설계사가 관리하는 고객 문서를 표준화된 트리 구조로 분류합니다.
실제 고객 폴더(TestData, 고객폴더 백업) 분석 + MongoDB 실데이터 기반으로 도출했습니다.

### 설계 원칙
- **2단계 트리**: 대분류(category) → 소분류(document_type)
- **보험 도메인 특화**: 설계사 실무 흐름에 맞춘 분류
- **MECE**: 상호 배타적, 전체 포괄적
- **확장 가능**: 새로운 소분류 추가 시 대분류 구조 유지

---

## 분류 트리

### 1. 보험 (insurance)

계약 체결 및 유지 관련 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 청약서 | `application` | 보험 가입 신청서 | 청약서, 청약서 부본, 가입신청서 |
| 보험증권 | `policy` | 계약 체결 증명 | 보험증권, 가입증명서, 보험가입확인서 |
| 약관 | `terms` | 보험 계약 조건 | 보험약관, 상품설명서, 상품안내장 |
| 설계서 | `plan_design` | 보장 설계 자료 | 보장설계서, 비교설계서, 보장분석표 |
| 제안서 | `proposal` | 종합 제안 자료 | 종합재무컨설팅 제안서, 보험제안서 |
| 연간보고서(AR) | `annual_report` | 보험사 연간 보고서 | Annual Report [시스템 자동감지] |
| 고객리뷰(CRS) | `customer_review` | 고객 리뷰 서비스 | Customer Review Service [시스템 자동감지] |

### 2. 보험금청구 (claim)

보험금 청구 및 지급 관련 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 보험금청구서 | `claim_form` | 보험금 지급 청구 | 보험금청구서, 지급청구서 |
| 진단서 | `diagnosis` | 의사 진단/소견 | 진단서, 소견서, 진료확인서 |
| 진료비영수증 | `medical_receipt` | 의료비 증빙 | 진료비영수증, 세부내역서, 처방전 |
| 사고증명서 | `accident_cert` | 사고 사실 증명 | 교통사고사실확인서, 상해진단서 |
| 입퇴원확인서 | `hospital_cert` | 입원/퇴원/수술 확인 | 입원확인서, 퇴원확인서, 수술확인서 |

### 3. 신분/증빙 (identity)

본인 확인 및 법적 증빙 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 신분증 | `id_card` | 본인 확인 증명 | 주민등록증, 운전면허증, 여권 |
| 가족관계서류 | `family_cert` | 가족 관계 증명 | 주민등록등본, 가족관계증명서 |
| 인감/서명 | `seal_signature` | 인감/서명 증명 | 인감증명서, 본인서명사실확인서 |
| 통장사본 | `bank_account` | 계좌 증빙 | 통장사본, 계좌개설확인서 |

### 4. 재정/세무 (financial)

소득, 재직, 세무 관련 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 소득증빙 | `income_proof` | 소득 관련 증명 | 원천징수영수증, 소득금액증명원 |
| 재직증명 | `employment_cert` | 재직/경력 증명 | 재직증명서, 경력증명서 |
| 재무제표 | `financial_statement` | 재무 상태 자료 | 재무제표, 손익계산서, 대차대조표 |
| 세무서류 | `tax_document` | 세금 신고/납부 | 세무조정계산서, 부가세신고서, 종합소득세신고서 |

### 5. 건강/의료 (medical)

건강 상태 및 의료 기록 문서. (청구용이 아닌 참고/관리용)

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 건강검진결과 | `health_checkup` | 건강검진 결과 | 종합건강검진결과지, 국가건강검진 |
| 의무기록 | `medical_record` | 의료 기록 사본 | 의무기록사본증명서, 검사결과지 |

### 6. 자산 (asset)

부동산, 차량, 사업자 등 자산 관련 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 등기부등본 | `property_registry` | 부동산 등기 | 부동산 등기부등본, 건축물대장 |
| 자동차등록 | `vehicle_registry` | 차량 관련 | 자동차등록증, 자동차보험증서 |
| 사업자등록 | `business_registry` | 사업자 증빙 | 사업자등록증, 사업자등록증명원 |

### 7. 법인 (corporate)

법인 고객 전용 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 법인등기 | `corp_registry` | 법인 등기/정관 | 법인등기부등본, 정관, 주주명부 |
| 인사/노무 | `hr_document` | 인사 관련 | 근로계약서, 급여대장, 취업규칙, 4대보험명부 |
| 사업계획서 | `business_plan` | 사업 기획 | 사업계획서, 컨설팅 보고서 |

### 8. 기타 (general)

위 분류에 해당하지 않는 문서.

| 소분류 | value | 설명 | 예시 |
|--------|-------|------|------|
| 일반문서 | `general` | 분류 불가 | 메모, 기타 문서 |
| 미지정 | `unspecified` | 유형 미지정 | 업로드 직후 미분류 상태 [시스템] |

---

## 분류 요약

| # | 대분류 (category) | 소분류 수 | value |
|---|-------------------|-----------|-------|
| 1 | 보험 | 7 | `insurance` |
| 2 | 보험금청구 | 5 | `claim` |
| 3 | 신분/증빙 | 4 | `identity` |
| 4 | 재정/세무 | 4 | `financial` |
| 5 | 건강/의료 | 2 | `medical` |
| 6 | 자산 | 3 | `asset` |
| 7 | 법인 | 3 | `corporate` |
| 8 | 기타 | 2 | `general` |
| | **합계** | **30** | |

---

## 태그 표준 체계

태그는 문서 유형과 **별개 축**으로, 문서의 속성/맥락을 나타냅니다.

### 태그 규칙
- `#` 접두사 사용하지 않음
- 띄어쓰기 없이 붙여쓰기 (예: `메트라이프`, NOT `메트라이프 생명`)
- 보험사명은 약칭으로 정규화 (예: `메트라이프생명보험` → `메트라이프`)

### 표준 태그 사전

#### 보험사
`메트라이프`, `삼성화재`, `삼성생명`, `KB손보`, `KB생명`, `현대해상`, `한화생명`, `한화손보`, `교보생명`, `AIA`, `DB손보`, `NH농협`, `흥국생명`, `라이나생명`, `동양생명`, `미래에셋생명`, `푸본현대`

#### 상품 유형
`종신보험`, `변액보험`, `변액종신`, `변액연금`, `암보험`, `실손보험`, `화재보험`, `자동차보험`, `연금보험`, `저축보험`, `건강보험`, `상해보험`, `운전자보험`, `어린이보험`, `치아보험`, `단체보험`

#### 문서 상태
`원본`, `사본`, `스캔`

---

## 현재 시스템 대비 변경 사항

### 추가 항목 (기존에 없던 것)
| value | label | category |
|-------|-------|----------|
| `plan_design` | 설계서 | insurance |
| `hospital_cert` | 입퇴원확인서 | claim |
| `income_proof` | 소득증빙 | financial |
| `employment_cert` | 재직증명 | financial |
| `financial_statement` | 재무제표 | financial |
| `tax_document` | 세무서류 | financial |
| `health_checkup` | 건강검진결과 | medical |
| `medical_record` | 의무기록 | medical |
| `property_registry` | 등기부등본 | asset |
| `vehicle_registry` | 자동차등록 | asset |
| `business_registry` | 사업자등록 | asset |
| `corp_registry` | 법인등기 | corporate |
| `hr_document` | 인사/노무 | corporate |
| `business_plan` | 사업계획서 | corporate |

### 변경 항목 (기존 → 변경)
| 기존 value | 변경 내용 |
|------------|----------|
| `income_employment` | `income_proof` + `employment_cert`로 분리 |
| `claim` | `claim_form`으로 rename (대분류 `claim`과 구분) |

### 유지 항목 (변경 없음)
`application`, `policy`, `terms`, `proposal`, `annual_report`, `customer_review`, `diagnosis`, `medical_receipt`, `accident_cert`, `id_card`, `family_cert`, `seal_signature`, `bank_account`, `general`, `unspecified`

---

## MongoDB 스키마 변경

### document_types 컬렉션
```javascript
{
  value: "diagnosis",
  label: "진단서",
  description: "의사 진단서, 소견서, 진료확인서, 입퇴원확인서",
  category: "claim",        // ← 신규: 대분류 코드
  categoryLabel: "보험금청구", // ← 신규: 대분류 표시명
  isSystem: false,
  order: 6
}
```

### files 컬렉션 (기존 필드 유지 + category 추가)
```javascript
{
  document_type: "diagnosis",
  document_category: "claim",  // ← 신규: 대분류 자동 부여
  // ... 기존 필드 유지
}
```
