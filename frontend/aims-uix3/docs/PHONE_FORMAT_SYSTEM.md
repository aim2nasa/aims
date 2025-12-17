# 전화번호 포맷 시스템

## 개요
네이버/카카오 스타일의 전화번호 자동 포맷팅 시스템.
사용자가 숫자만 입력해도 자동으로 하이픈이 추가됩니다.

## 동작 방식

### 입력
- 사용자: `01012345678` 입력
- 결과: `010-1234-5678`로 자동 변환

### 지원 포맷
| 유형 | 입력 예시 | 출력 포맷 |
|------|----------|----------|
| 휴대폰 | 01012345678 | 010-1234-5678 |
| 서울 | 0212345678 | 02-1234-5678 |
| 지역번호 | 03112345678 | 031-1234-5678 |

## 파일 위치

### 유틸리티
```
src/shared/lib/phoneUtils.ts
```

### 사용처
```
src/features/customer/views/CustomerRegistrationView/components/ContactSection.tsx
```

## API

### `formatPhoneNumber(value: string): string`
전화번호 문자열을 받아 하이픈이 포함된 형태로 반환합니다.

```typescript
import { formatPhoneNumber } from '@/shared/lib/phoneUtils';

formatPhoneNumber('01012345678');  // '010-1234-5678'
formatPhoneNumber('0212345678');   // '02-1234-5678'
formatPhoneNumber('03112345678');  // '031-1234-5678'
```

### `extractDigits(value: string): string`
문자열에서 숫자만 추출합니다.

```typescript
import { extractDigits } from '@/shared/lib/phoneUtils';

extractDigits('010-1234-5678');  // '01012345678'
extractDigits('abc123def456');   // '123456'
```

## 적용 필드
- 휴대폰 (`mobile_phone`)
- 집 전화 (`home_phone`)
- 회사 전화 (`work_phone`)

## 사용 예시

```tsx
import { formatPhoneNumber } from '@/shared/lib/phoneUtils';

const handlePhoneChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const formatted = formatPhoneNumber(e.target.value);
  onChange(field, formatted);
};

<input
  type="tel"
  value={phone}
  onChange={handlePhoneChange('mobile_phone')}
  maxLength={13}
/>
```
