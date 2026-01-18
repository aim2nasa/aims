# MCP Tools TODO

나중에 구현해야 할 MCP 도구 목록

---

## 고객 관리 (Customers)

### deactivate_customer - 고객 휴면 처리

**우선순위:** 중간

**현황:**
- API 존재: `DELETE /api/customers/:id` (soft delete → `meta.status: 'inactive'`)
- MCP 도구: 없음

**필요 이유:**
- `restore_customer` (휴면 → 활성)는 있으나, 반대 기능 없음
- AI 어시스턴트가 "고객 휴면 처리해줘" 요청을 처리할 수 없음

**구현 예정:**
```typescript
{
  name: 'deactivate_customer',
  description: '고객을 휴면 상태로 변경합니다. 휴면 고객은 목록에서 숨겨지며, 나중에 활성화할 수 있습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: '휴면 처리할 고객 ID' },
      reason: { type: 'string', description: '휴면 사유 (선택)' }
    },
    required: ['customerId']
  }
}
```

**대화 예시:**
```
👤 사용자: 홍길동 고객 휴면 처리해줘
🤖 AI: 홍길동 고객을 휴면 처리했습니다.

✅ **휴면 처리 완료**
- 이름: 홍길동
- 휴면 전환일: 2026.01.19
- 상태: 휴면

연결된 문서 3개도 함께 비활성화되었습니다.
다시 활성화하려면 "휴면 고객 홍길동 활성화해줘"라고 말씀해주세요.
```

---

## 완료된 항목

(구현 완료 시 여기로 이동)

---

*마지막 업데이트: 2026-01-19*
