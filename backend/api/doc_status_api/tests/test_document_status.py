"""
test_document_status.py
문서 상태 계산 로직 (get_overall_status) 유닛 테스트

get_overall_status 함수는 문서의 처리 단계를 분석하여 전체 상태와 진행률을 계산합니다.

처리 경로:
1. [U] Upload → [M] Meta → [Mt] Meta with text → [Mts] Meta with summary → [E] Embed
2. [U] Upload → [Mx] Meta without text → [O] OCR → [Ot] OCR with text → [Ots] OCR with summary → [E] Embed
3. [U] Upload → [Mx] Meta without text → Unsupported MIME → Completed
4. [U] Upload → [Mx] Meta without text → [Ox] OCR without text → Completed

테스트 시나리오:
1. Upload 없음 → pending, 0%
2. Upload만 완료, Meta 없음 → processing, 25%
3. Meta 완료, full_text 있음, summary 없음 → processing, 50%
4. Meta + Summary 완료, Embed 진행중 → processing, 75%
5. Meta + Summary + Embed 완료 → completed, 100%
6. Meta + Summary + Embed 실패 → error, 100%
7. Meta 완료, full_text 없음, unsupported MIME → completed, 100%
8. Meta 완료, full_text 없음, OCR pending → processing, 50%
9. OCR queued → processing, 60%
10. OCR running → processing, 70%
11. OCR error → error, 100%
12. OCR 완료, text 없음 → completed, 100%
13. OCR 완료, text 있음, summary 없음 → processing, 80%
14. OCR + Summary 완료, Embed 진행중 → processing, 90%
15. OCR + Summary + Embed 완료 → completed, 100%
16. OCR + Summary + Embed 실패 → error, 100%
"""

import pytest
from datetime import datetime, UTC
from bson import ObjectId
from typing import Dict


# get_overall_status 함수를 직접 복사 (import 순환참조 방지)
def get_overall_status(doc: Dict) -> tuple[str, int]:
    """새로운 상태 코드 기준에 따른 전체 처리 상태와 진행률 계산"""

    # 기본 정보 추출
    upload_info = doc.get('upload', {})
    meta_info = doc.get('meta', {})
    ocr_info = doc.get('ocr', {})
    embed_info = doc.get('embed', {}) or doc.get('docembed', {})

    # [U] Upload 체크
    if not upload_info:
        return 'pending', 0

    # [M] Meta 체크
    if not meta_info or meta_info.get('meta_status') != 'ok':
        return 'processing', 25  # Upload만 완료

    # Meta에서 full_text 확인
    full_text = meta_info.get('full_text')
    has_meaningful_text = full_text and full_text.strip()

    if has_meaningful_text:
        # [Mt] -> [Mts] -> [E] 경로
        summary = meta_info.get('summary')
        if not summary:
            return 'processing', 50  # Meta 완료, Summary 대기

        # [Mts] 완료, Embed 체크
        embed_status = embed_info.get('status')
        if embed_status == 'done':
            return 'completed', 100  # [U][Mts][E] 완료
        elif embed_status == 'failed':
            return 'error', 100     # [U][Mts][Ef] 완료 (실패)
        else:
            return 'processing', 75  # Embed 진행중
    else:
        # [Mx] full_text 비어있음 - MIME 타입 체크
        mime_type = meta_info.get('mime', '')

        # 지원하지 않는 MIME 타입들 (OCR 불가)
        unsupported_mimes = [
            'text/plain', 'text/csv', 'text/markdown',
            'application/json', 'application/xml',
            'audio/', 'video/', 'application/zip',
            'application/x-rar-compressed'
        ]

        is_unsupported = any(mime_type.startswith(unsupported) for unsupported in unsupported_mimes)

        if is_unsupported:
            return 'completed', 100  # [U][Mx] MIME 미지원으로 완료

        # OCR 지원 MIME - OCR 상태 체크
        ocr_status = ocr_info.get('status', 'pending')

        if ocr_status == 'pending':
            return 'processing', 50  # [U][Mx] OCR 대기
        elif ocr_status == 'queued':
            return 'processing', 60  # [U][Mx][Oq] OCR 큐 대기
        elif ocr_status == 'running':
            return 'processing', 70  # [U][Mx][Or] OCR 실행중
        elif ocr_status == 'error':
            return 'error', 100      # [U][Mx][Oe] OCR 오류로 완료
        elif ocr_status == 'done':
            # OCR 완료 - OCR 결과 텍스트 확인
            ocr_full_text = ocr_info.get('full_text')
            has_ocr_text = ocr_full_text and ocr_full_text.strip()

            if not has_ocr_text:
                return 'completed', 100  # [U][Mx][Ox] OCR 텍스트 없음으로 완료

            # [Ot] OCR 텍스트 존재 - Summary 체크
            ocr_summary = ocr_info.get('summary')
            if not ocr_summary:
                return 'processing', 80  # OCR Summary 대기

            # [Ots] OCR Summary 완료 - Embed 체크
            embed_status = embed_info.get('status')
            if embed_status == 'done':
                return 'completed', 100  # [U][Mx][Ots][E] 완료
            elif embed_status == 'failed':
                return 'error', 100     # [U][Mx][Ots][Ef] 완료 (실패)
            else:
                return 'processing', 90  # Embed 진행중

    # 폴백 (여기 도달하면 안 됨)
    return 'processing', 0


class TestDocumentStatusUploadStage:
    """Upload 단계 상태 테스트"""

    def test_no_upload_returns_pending(self):
        """Upload 없음 → pending, 0%"""
        doc = {}

        status, progress = get_overall_status(doc)

        assert status == "pending"
        assert progress == 0

    def test_upload_only_returns_processing_25(self):
        """Upload만 완료, Meta 없음 → processing, 25%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf",
                "uploaded_at": datetime.now(UTC)
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 25

    def test_upload_with_meta_not_ok(self):
        """Upload 완료, Meta 실패 → processing, 25%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "error"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 25


class TestDocumentStatusMetaWithTextPath:
    """Meta with text 경로 ([Mt] → [Mts] → [E])"""

    def test_meta_with_text_no_summary(self):
        """Meta 완료, full_text 있음, summary 없음 → processing, 50%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "This is some text content"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 50

    def test_meta_with_text_and_summary_no_embed(self):
        """Meta + Summary 완료, Embed 없음 → processing, 75%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "Text content",
                "summary": "This is a summary"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 75

    def test_meta_with_text_summary_embed_done(self):
        """Meta + Summary + Embed 완료 → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "Text content",
                "summary": "Summary"
            },
            "embed": {
                "status": "done",
                "chunks": 10,
                "dims": 1536
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_meta_with_text_summary_embed_failed(self):
        """Meta + Summary + Embed 실패 → error, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "Text content",
                "summary": "Summary"
            },
            "embed": {
                "status": "failed",
                "error_message": "Embedding failed"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "error"
        assert progress == 100

    def test_meta_with_whitespace_only_text(self):
        """Meta 완료, full_text가 공백만 → [Mx] 경로로 진입"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "   \n\t  ",  # 공백만
                "mime": "application/pdf"
            }
        }

        status, progress = get_overall_status(doc)

        # [Mx] 경로 → OCR 대기
        assert status == "processing"
        assert progress == 50


class TestDocumentStatusMetaWithoutTextUnsupportedMIME:
    """Meta without text + Unsupported MIME 경로"""

    def test_meta_no_text_unsupported_mime_text_plain(self):
        """Meta 완료, text 없음, text/plain → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.txt"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "text/plain"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_meta_no_text_unsupported_mime_csv(self):
        """Meta 완료, text 없음, text/csv → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.csv"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "text/csv"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_meta_no_text_unsupported_mime_audio(self):
        """Meta 완료, text 없음, audio/* → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.mp3"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "audio/mpeg"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_meta_no_text_unsupported_mime_zip(self):
        """Meta 완료, text 없음, application/zip → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.zip"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/zip"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100


class TestDocumentStatusOCRPath:
    """OCR 경로 ([Mx] → [O] → [Ot] → [Ots] → [E])"""

    def test_ocr_pending(self):
        """Meta 완료, text 없음, OCR pending → processing, 50%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "pending"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 50

    def test_ocr_queued(self):
        """OCR queued → processing, 60%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "queued",
                "queued_at": datetime.now(UTC)
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 60

    def test_ocr_running(self):
        """OCR running → processing, 70%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "running",
                "started_at": datetime.now(UTC)
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 70

    def test_ocr_error(self):
        """OCR error → error, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "error",
                "statusMessage": "OCR failed"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "error"
        assert progress == 100

    def test_ocr_done_no_text(self):
        """OCR 완료, text 없음 → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "done",
                "full_text": "",  # 텍스트 없음
                "done_at": datetime.now(UTC)
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_ocr_done_with_text_no_summary(self):
        """OCR 완료, text 있음, summary 없음 → processing, 80%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "done",
                "full_text": "OCR extracted text"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 80

    def test_ocr_done_with_text_and_summary_no_embed(self):
        """OCR + Summary 완료, Embed 없음 → processing, 90%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "done",
                "full_text": "OCR text",
                "summary": "OCR summary"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 90

    def test_ocr_path_embed_done(self):
        """OCR + Summary + Embed 완료 → completed, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "done",
                "full_text": "OCR text",
                "summary": "OCR summary"
            },
            "embed": {
                "status": "done",
                "chunks": 5
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_ocr_path_embed_failed(self):
        """OCR + Summary + Embed 실패 → error, 100%"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {
                "status": "done",
                "full_text": "OCR text",
                "summary": "OCR summary"
            },
            "embed": {
                "status": "failed",
                "error_message": "Embedding failed"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "error"
        assert progress == 100


class TestDocumentStatusEdgeCases:
    """엣지 케이스 및 예외 상황"""

    def test_embed_field_as_docembed(self):
        """embed가 아닌 docembed 필드 사용 시에도 정상 동작"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "Text",
                "summary": "Summary"
            },
            "docembed": {  # embed 대신 docembed
                "status": "done",
                "chunks": 10
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_ocr_status_missing_defaults_to_pending(self):
        """OCR status 필드 없음 → pending으로 간주"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "",
                "mime": "application/pdf"
            },
            "ocr": {}  # status 없음
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 50  # OCR pending

    def test_meta_none_returns_processing_25(self):
        """meta가 None인 경우"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": None
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 25

    def test_embed_none_processed_correctly(self):
        """embed가 None인 경우에도 정상 처리"""
        doc = {
            "upload": {
                "destPath": "/tmp/test.pdf"
            },
            "meta": {
                "meta_status": "ok",
                "full_text": "Text",
                "summary": "Summary"
            },
            "embed": None
        }

        status, progress = get_overall_status(doc)

        assert status == "processing"
        assert progress == 75  # Embed 진행중 (None = 대기)


class TestDocumentStatusRealWorldScenarios:
    """실제 사용 시나리오"""

    def test_typical_pdf_with_text_complete_workflow(self):
        """일반적인 텍스트 PDF 완전 처리 워크플로우"""
        doc = {
            "_id": ObjectId(),
            "upload": {
                "originalName": "contract.pdf",
                "destPath": "/uploads/contract.pdf",
                "uploaded_at": datetime.now(UTC)
            },
            "meta": {
                "meta_status": "ok",
                "mime": "application/pdf",
                "size_bytes": 1024000,
                "pdf_pages": 10,
                "full_text": "This is a contract document...",
                "summary": "Contract between parties",
                "created_at": datetime.now(UTC)
            },
            "embed": {
                "status": "done",
                "dims": 1536,
                "chunks": 15,
                "updated_at": datetime.now(UTC)
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_scanned_pdf_with_ocr_complete_workflow(self):
        """스캔 PDF OCR 처리 완전 워크플로우"""
        doc = {
            "_id": ObjectId(),
            "upload": {
                "originalName": "scanned.pdf",
                "destPath": "/uploads/scanned.pdf",
                "uploaded_at": datetime.now(UTC)
            },
            "meta": {
                "meta_status": "ok",
                "mime": "application/pdf",
                "full_text": "",  # 텍스트 없음
                "pdf_pages": 5
            },
            "ocr": {
                "status": "done",
                "full_text": "OCR extracted text from scanned pages...",
                "summary": "Scanned document summary",
                "confidence": 0.95,
                "started_at": datetime.now(UTC),
                "done_at": datetime.now(UTC)
            },
            "embed": {
                "status": "done",
                "chunks": 8
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100

    def test_image_file_with_ocr(self):
        """이미지 파일 OCR 처리"""
        doc = {
            "upload": {
                "originalName": "receipt.jpg",
                "destPath": "/uploads/receipt.jpg"
            },
            "meta": {
                "meta_status": "ok",
                "mime": "image/jpeg",
                "full_text": ""
            },
            "ocr": {
                "status": "done",
                "full_text": "Receipt data...",
                "summary": "Receipt from store"
            },
            "embed": {
                "status": "done"
            }
        }

        status, progress = get_overall_status(doc)

        assert status == "completed"
        assert progress == 100
