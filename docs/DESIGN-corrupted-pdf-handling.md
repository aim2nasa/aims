# 설계서: 손상된 PDF 업로드 에러 처리 개선

**일자:** 2026-03-28
**버전:** v2 (Alex/Gini 리뷰 반영)
**관련 이슈:** [ISSUE-corrupted-pdf-pipeline-error.md](issues/ISSUE-corrupted-pdf-pipeline-error.md)
**영역:** 백엔드 (xPipe extract 스테이지 + doc_prep_main.py) + 프론트엔드 (진행률 표시)

---

## 1. 현재 문제

### 1-1. 백엔드: 손상 PDF를 정상 스캔 PDF와 구분하지 못함

`extract.py:108-109`에서 pdfplumber 예외를 조용히 무시하고 빈 문자열 반환:

```python
except Exception:
    return ""  # 손상 파일도 "텍스트 없음"으로 처리
```

**결과 흐름:**
```
손상 PDF → _read_pdf_file() → pdfplumber Exception → "" 반환
→ "스캔 이미지 PDF"와 동일 경로
→ _try_ocr() → Upstage API 호출 (유료 크레딧 소비)
→ 400: "The document is empty" → error
```

### 1-2. `_convert_and_extract()`에도 동일 패턴 존재

`extract.py:167-169`에서 LibreOffice 변환 산출 PDF의 pdfplumber 예외도 무시:

```python
except Exception as e:
    _logger.warning("PDF 텍스트 추출 실패: %s — %s", file_name, e)
    return ""
```

### 1-3. `doc_prep_main.py`에서 손상 PDF가 "보관 완료"로 처리됨

현재 `text_extraction_failed` 핸들러(2205행)의 분기:
- `is_convertible_mime()` → conversion_pending
- **그 외(PDF 포함)** → `overallStatus: "completed"`, `progress: 100` (보관 완료)

손상 PDF도 이 "보관 완료" 경로를 타서 사용자에게 **정상 완료로 표시**됨.

### 1-4. 프론트엔드: 에러 상태가 진행률로 표시됨

`DocumentStatusService.ts:555-565`에서 `document.progress`가 있으면 `overallStatus`를 확인하지 않고 그대로 반환 → `overallStatus: "error"`, `progress: 40`인 문서가 파란색 `40%`로 표시.

---

## 2. 수정 설계

### Phase 1: 백엔드 — 손상 PDF 감지 + OCR 호출 차단

#### 수정 파일 1: `backend/api/document_pipeline/xpipe/stages/extract.py`

#### 2-1. `_read_pdf_file()` 수정

pdfplumber 예외를 **`pdfplumber.open()` 레벨**과 **`page.extract_text()` 레벨**로 구분:

```python
class CorruptedPDFError(Exception):
    """PDF 파일이 손상되어 파싱할 수 없음"""
    pass

@staticmethod
def _read_pdf_file(file_path: str, file_name: str) -> str:
    import os
    if not file_path or not os.path.exists(file_path):
        return ""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                except Exception as page_exc:
                    # 개별 페이지 실패는 스킵 (부분 손상 PDF 대응)
                    _logger.warning(
                        "[ExtractStage] PDF 페이지 추출 실패 (스킵): %s page %d — %s",
                        file_name, page.page_number, page_exc
                    )
        return "\n".join(text_parts)
    except ImportError:
        return ""
    except Exception as exc:
        # pdfplumber.open() 자체 실패 → 파일 구조 손상
        _logger.warning("[ExtractStage] PDF 파싱 실패 (손상 의심): %s — %s", file_name, exc)
        raise CorruptedPDFError(file_name) from exc
```

**엣지 케이스 처리:**
- `pdfplumber.open()` 실패 → `CorruptedPDFError` raise (파일 구조 손상)
- `page.extract_text()` 실패 → 해당 페이지만 스킵, 나머지 텍스트 반환 (부분 손상)
- 암호화 PDF → pdfplumber가 `PdfReadError` 발생 → `CorruptedPDFError`로 래핑됨. 에러 메시지는 호출부에서 구분 (2-2 참조)

#### 2-2. PDF 분기 로직 수정 (라인 284-295)

```python
elif is_pdf:
    method = "pdfplumber"
    ocr_model = "-"
    try:
        text = self._read_pdf_file(file_path, file_name)
    except CorruptedPDFError as cpf:
        # 손상/암호화 PDF: OCR 호출 스킵, 에러 상태로 전환
        text = ""
        context["text_extraction_failed"] = True
        context["_extraction_skip_reason"] = "corrupted_pdf"

        # 암호화 PDF 구분
        original_exc = str(cpf.__cause__) if cpf.__cause__ else ""
        if "encrypt" in original_exc.lower() or "password" in original_exc.lower():
            context["_user_error_message"] = (
                "비밀번호로 보호된 파일입니다. "
                "비밀번호를 해제한 후 다시 업로드해 주세요."
            )
        else:
            context["_user_error_message"] = (
                "파일이 손상되어 내용을 읽을 수 없습니다. "
                "원본 파일을 확인하신 후 다시 업로드해 주세요."
            )
        # OCR fallback 진입하지 않음
    else:
        if not text and mode == "real":
            method = "pdfplumber+ocr_fallback"
            text, ocr_model = await self._try_ocr(
                context, file_path, file_name, mime, ocr_model_name
            )
        elif not text:
            text = ""
```

#### 2-3. `_convert_and_extract()` 동일 패턴 수정 (재발 방지)

`extract.py:167-169`의 `except Exception` → `CorruptedPDFError` raise로 변경:

```python
except Exception as e:
    _logger.warning(
        "[ExtractStage] 변환 PDF 텍스트 추출 실패 (손상 의심): %s — %s",
        file_name, e
    )
    raise CorruptedPDFError(file_name) from e
```

이 예외는 `execute()` 메서드 외부의 `doc_prep_main.py` 범용 에러 핸들러(2190-2201행)에서 처리됨. LibreOffice가 생성한 출력 PDF가 손상될 가능성은 극히 낮으나, 발생 시에도 안전하게 에러로 처리됨.

참고: `is_convertible` 분기에서 `_read_pdf_file(converted, file_name)` 호출(302행)도 수정된 `_read_pdf_file()`이 `CorruptedPDFError`를 raise할 수 있으나, ConvertStage가 생성한 PDF이므로 발생 가능성이 극히 낮고, 발생 시 동일한 범용 에러 핸들러에서 처리됨.

#### 수정 파일 2: `backend/api/document_pipeline/routers/doc_prep_main.py`

#### 2-4. `text_extraction_failed` 핸들러에 `corrupted_pdf` 전용 분기 추가

`doc_prep_main.py:2205` 블록에서 `_extraction_skip_reason == "corrupted_pdf"`를 **보관 완료 분기 앞에** 별도 처리:

```python
if result.get("text_extraction_failed"):
    skip_reason = (
        result.get("_extraction_skip_reason")
        or ("unsupported_format" if result.get("unsupported_format") else "no_text_extractable")
    )

    # ★ 손상/암호화 PDF: 에러 상태로 처리 (보관 완료 아님)
    if skip_reason == "corrupted_pdf":
        user_message = result.get(
            "_user_error_message",
            "파일이 손상되어 처리할 수 없습니다."
        )
        logger.warning(
            f"[xPipe] 손상 PDF 감지 — 에러 처리: doc_id={doc_id}, "
            f"file={original_name}"
        )
        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "status": "failed",
                "overallStatus": "error",
                "overallStatusUpdatedAt": datetime.utcnow(),
                "error.statusCode": 422,
                "error.statusMessage": user_message,  # 사용자 친화적 메시지만
                "error.timestamp": datetime.utcnow().isoformat(),
                "processingSkipReason": skip_reason,
                "meta.mime": detected_mime,
                "meta.filename": original_name,
                "meta.extension": os.path.splitext(original_name or "")[1].lower(),
                "meta.size_bytes": len(file_content) if file_content else 0,
                "upload.originalName": original_name,
                "progressStage": "error",
                "progress": 0,
            }},
        )
        await _notify_progress(
            doc_id, user_id, -1, "error", user_message
        )
        await _notify_document_complete(doc_id, user_id)

        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

        return {
            "result": "error",
            "doc_id": doc_id,
            "status": "failed",
            "overallStatus": "error",
            "engine": "xpipe",
            "error": user_message,
        }

    # (기존) 변환 대상 파일 → conversion_pending
    if is_convertible_mime(detected_mime):
        ...
    # (기존) 비변환 대상 → 보관 완료
    ...
```

#### 2-5. 보안: `error.statusMessage`에 내부 경로 미노출

기존 범용 에러 핸들러(2197행) `"error.statusMessage": str(e)`는 서버 파일 경로가 포함될 수 있음. 손상 PDF 분기에서는 `_user_error_message`(사용자 친화적 메시지)만 저장하므로 이 문제를 회피.

기존 범용 에러 핸들러의 `str(e)` 문제는 이번 범위 밖이나, 향후 개선 대상으로 기록.

---

### Phase 2: 프론트엔드 — 에러 상태 진행률 수정

#### 수정 파일: `frontend/aims-uix3/src/services/DocumentStatusService.ts`

#### 2-6. `extractProgress()`에 에러 상태 우선 처리

```typescript
static extractProgress(document: Document): number {
    // 에러/타임아웃 상태: progress 값이 있어도 에러로 표시해야 함
    // (파이프라인 중간에 에러 발생 시 progress가 40 등으로 남아있을 수 있음)
    if (document.overallStatus === 'error' || document.overallStatus === 'timeout') {
      return 0
    }

    // ... 기존 로직 (변경 없음)
}
```

**렌더링 동작 확인:**
- `extractStatus()` → `overallStatus: "error"` → `'error'` 반환 (`DocumentProcessingModule.ts:292`)
- `DocumentStatusList` → `status === 'error'` 분기 → 에러 아이콘 + 재시도 버튼 표시
- `extractProgress()` → `0` 반환 → 진행률 바 0% (에러 색상 `status-error`)
- **부작용 없음**: 진행률은 상태 컬럼 옆에 표시되며, 에러 상태에서는 진행률 % 텍스트가 표시되지 않음 (에러 레이블로 대체)

---

## 3. 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `backend/api/document_pipeline/xpipe/stages/extract.py` | `CorruptedPDFError` 정의, `_read_pdf_file()` 예외 구분(파일/페이지 레벨), `_convert_and_extract()` 동일 패턴 수정 |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | `corrupted_pdf` 전용 분기 추가 (에러 상태 설정 + 사용자 메시지 DB 저장) |
| `frontend/aims-uix3/src/services/DocumentStatusService.ts` | `extractProgress()`에 에러 상태 우선 처리 |

---

## 4. 테스트 계획

### 4-1. 백엔드 — extract.py

- `_read_pdf_file()`에 손상 PDF 전달 시 `CorruptedPDFError` raise 확인
- 정상 PDF는 기존대로 텍스트 반환 확인
- 부분 손상 PDF (일부 페이지만 실패) → 나머지 페이지 텍스트 반환 확인
- 암호화 PDF → `CorruptedPDFError` raise + 원본 예외에 "encrypt"/"password" 포함 확인
- `_convert_and_extract()`에서도 pdfplumber 실패 시 `CorruptedPDFError` raise 확인

### 4-2. 백엔드 — doc_prep_main.py

- `_extraction_skip_reason == "corrupted_pdf"` 시 DB에 `overallStatus: "error"` 저장 확인
- `error.statusMessage`에 서버 내부 경로 미포함 확인
- `error.statusMessage`에 사용자 친화적 메시지 저장 확인
- `_notify_progress`에 `progress: -1` (에러) 전송 확인

### 4-3. 프론트엔드 — DocumentStatusService.ts

- `overallStatus: "error"`, `progress: 40`인 문서 → `extractProgress()` → `0` 반환 확인
- `overallStatus: "timeout"`, `progress: 60`인 문서 → `extractProgress()` → `0` 반환 확인
- `overallStatus: "completed"` → 기존대로 `100` 반환 확인
- `overallStatus: "processing"`, `progress: 60` → 기존대로 `60` 반환 확인
- `overallStatus: undefined`, `progress: 40` → 기존대로 `40` 반환 확인

---

## 5. 영향 범위

| 파일 유형 | 영향 |
|-----------|------|
| 정상 PDF (텍스트 있음) | 없음 — pdfplumber 성공 시 기존 경로 |
| 정상 스캔 PDF (텍스트 없음, 이미지만) | 없음 — pdfplumber 빈 텍스트 반환 → OCR fallback 유지 |
| 부분 손상 PDF | 개선 — 읽을 수 있는 페이지만 추출, 실패 페이지 스킵 |
| 완전 손상 PDF | 개선 — 즉시 에러 처리, OCR 호출 스킵, 사용자 안내 |
| 암호화 PDF | 개선 — 별도 에러 메시지로 안내 |
| HWP/DOC 변환 후 손상 | 개선 — `_convert_and_extract()` 동일 패턴 수정 |
| 기존 에러 상태 문서 (DB) | 개선 — `extractProgress()`가 에러 상태에서 0 반환 |

---

## 6. 비고

- Phase 3 (업로드 시점 사전 검증)은 별도 PoC 필요 — 이번 설계 범위에 포함하지 않음
- 기존 범용 에러 핸들러(`doc_prep_main.py:2197`)의 `str(e)` 경로 노출 문제는 별도 이슈로 추적
