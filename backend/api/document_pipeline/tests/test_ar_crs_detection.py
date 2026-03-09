"""
AR/CRS 자동 감지 회귀 테스트

대상 함수:
- _detect_and_process_annual_report() (doc_prep_main.py:471)
- _detect_and_process_customer_review() (doc_prep_main.py:682)

깨지면: AR/CRS 문서 미감지 → 고객 자동 연결 실패, 파싱 파이프라인 중단
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

# 테스트용 유효한 ObjectId
TEST_DOC_ID = "507f1f77bcf86cd799439011"


# ========================================
# AR Pattern Detection
# ========================================

class TestARPatternDetection:
    """AR 텍스트 패턴 감지 정확성 테스트"""

    @pytest.fixture
    def files_collection(self):
        mock = AsyncMock()
        mock.update_one = AsyncMock()
        return mock

    async def _call_detect_ar(self, full_text, files_collection):
        """Helper: AR 감지 함수 호출"""
        from routers.doc_prep_main import _detect_and_process_annual_report

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            return await _detect_and_process_annual_report(
                doc_id=TEST_DOC_ID,
                full_text=full_text,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

    async def test_required_plus_optional_keywords(self, ar_text_sample, files_collection):
        """필수('Annual Review Report') + 선택('보유계약 현황') → AR 감지"""
        result = await self._call_detect_ar(ar_text_sample, files_collection)
        assert result["is_annual_report"] is True

    async def test_required_only_no_optional(self, files_collection):
        """필수 키워드만 있고 선택 키워드 없으면 → AR 아님"""
        text = "This is an Annual Review Report for testing only."
        result = await self._call_detect_ar(text, files_collection)
        assert result["is_annual_report"] is False

    async def test_optional_only_no_required(self, files_collection):
        """선택 키워드만 있고 필수 키워드 없으면 → AR 아님"""
        text = "보유계약 현황\n메트라이프생명\n고객님을 위한 보험 안내"
        result = await self._call_detect_ar(text, files_collection)
        assert result["is_annual_report"] is False

    async def test_whitespace_normalization(self, files_collection):
        """공백이 여러 개여도 정규화하여 매칭"""
        text = (
            "홍길동 고객님을 위한\n"
            "Annual   Review   Report\n"
            "보유계약   현황\n"
        )
        result = await self._call_detect_ar(text, files_collection)
        # 공백 정규화로 매칭되어야 함
        assert result["is_annual_report"] is True

    async def test_metlife_as_optional_keyword(self, files_collection):
        """'MetLife'만으로도 선택 키워드 충족"""
        text = "MetLife\nSomething\nAnnual Review Report\n"
        result = await self._call_detect_ar(text, files_collection)
        assert result["is_annual_report"] is True

    async def test_metlife_korean_as_optional(self, files_collection):
        """'메트라이프' 한글도 선택 키워드 충족"""
        text = "메트라이프\n고객정보\nAnnual Review Report\n"
        result = await self._call_detect_ar(text, files_collection)
        assert result["is_annual_report"] is True

    async def test_empty_text(self, files_collection):
        """빈 텍스트 → AR 아님"""
        result = await self._call_detect_ar("", files_collection)
        assert result["is_annual_report"] is False

    async def test_exception_isolation(self, files_collection):
        """내부 예외 발생 시 False 반환 (전체 파이프라인 중단 방지)"""
        # files_collection.update_one이 예외를 던져도 함수는 False 반환
        files_collection.update_one.side_effect = Exception("DB error")
        # AR 감지 자체는 성공하지만 DB 업데이트에서 예외 → 함수 예외 캐치 → False
        from routers.doc_prep_main import _detect_and_process_annual_report

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await _detect_and_process_annual_report(
                doc_id=TEST_DOC_ID,
                full_text="MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황",
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )
        assert result["is_annual_report"] is False


# ========================================
# AR Customer Name Extraction
# ========================================

class TestARCustomerNameExtraction:
    """AR 고객명 추출 정확성 테스트"""

    @pytest.fixture
    def files_collection(self):
        mock = AsyncMock()
        mock.update_one = AsyncMock()
        return mock

    async def _call_detect_ar(self, full_text, files_collection):
        from routers.doc_prep_main import _detect_and_process_annual_report

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            return await _detect_and_process_annual_report(
                doc_id=TEST_DOC_ID,
                full_text=full_text,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

    async def test_standard_name_extraction(self, files_collection):
        """'홍길동 고객님을 위한' → '홍길동' 추출"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = await self._call_detect_ar(text, files_collection)
        assert result["customer_name"] == "홍길동"

    async def test_name_too_short(self, files_collection):
        """1자 이름 → 추출 안됨 (2자 미만 필터)"""
        text = "MetLife\n김 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = await self._call_detect_ar(text, files_collection)
        assert result["customer_name"] is None

    async def test_metlife_header_before_name(self, files_collection):
        """MetLife 헤더가 이름 위에 있어도 'Annual' 위 줄에서 이름 추출"""
        text = "MetLife\n박지성 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = await self._call_detect_ar(text, files_collection)
        assert result["customer_name"] == "박지성"

    async def test_name_without_gokaeknim(self, files_collection):
        """'고객님을 위한' 패턴 없이 이름 줄이 있으면 → 공백 기준 첫 단어"""
        text = "MetLife\n이순신 장군의\nAnnual Review Report\n보유계약 현황"
        result = await self._call_detect_ar(text, files_collection)
        assert result["customer_name"] == "이순신"

    async def test_filename_not_used_for_name(self, files_collection):
        """파일명의 이름은 무시 (CLAUDE.md 0-3 규칙)"""
        text = "MetLife\n최민수 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = await self._call_detect_ar(text, files_collection)
        # original_name="test.pdf"이므로 파일명이 아닌 텍스트에서 이름 추출
        assert result["customer_name"] == "최민수"


# ========================================
# AR Issue Date Extraction
# ========================================

class TestARIssueDateExtraction:
    """AR 발행일 추출 정확성 테스트"""

    @pytest.fixture
    def files_collection(self):
        mock = AsyncMock()
        mock.update_one = AsyncMock()
        return mock

    async def _call_detect_ar(self, full_text, files_collection):
        from routers.doc_prep_main import _detect_and_process_annual_report

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            return await _detect_and_process_annual_report(
                doc_id=TEST_DOC_ID,
                full_text=full_text,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

    async def test_issue_date_standard_format(self, files_collection):
        """'발행(기준)일: 2026년 1월 15일' → '2026-01-15'"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n발행(기준)일: 2026년 1월 15일"
        result = await self._call_detect_ar(text, files_collection)
        assert result["issue_date"] == "2026-01-15"

    async def test_issue_date_zfill(self, files_collection):
        """월/일이 1자리인 경우 0 패딩"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n발행일: 2026년 2월 3일"
        result = await self._call_detect_ar(text, files_collection)
        assert result["issue_date"] == "2026-02-03"

    async def test_issue_date_fallback_pattern(self, files_collection):
        """'발행일' 없이 일반 날짜 패턴 → 대체 추출"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n2025년 12월 25일 기준"
        result = await self._call_detect_ar(text, files_collection)
        assert result["issue_date"] == "2025-12-25"

    async def test_issue_date_not_found(self, files_collection):
        """날짜 패턴 없으면 None"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = await self._call_detect_ar(text, files_collection)
        assert result["issue_date"] is None


# ========================================
# AR DB Update
# ========================================

class TestARDBUpdate:
    """AR 감지 후 DB 업데이트 검증"""

    @pytest.fixture
    def files_collection(self):
        mock = AsyncMock()
        mock.update_one = AsyncMock()
        return mock

    async def test_ar_flag_and_parsing_status(self, ar_text_sample, files_collection):
        """AR 감지 시 is_annual_report=True, ar_parsing_status='pending' 설정"""
        from routers.doc_prep_main import _detect_and_process_annual_report

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _detect_and_process_annual_report(
                doc_id="507f1f77bcf86cd799439011",
                full_text=ar_text_sample,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

        # DB update_one이 호출되었는지 확인
        assert files_collection.update_one.called
        call_args = files_collection.update_one.call_args
        update_set = call_args[0][1]["$set"]
        assert update_set["is_annual_report"] is True
        assert update_set["ar_parsing_status"] == "pending"

    async def test_display_name_format(self, files_collection):
        """displayName = '{고객명}_AR_{YYYY-MM-DD}.pdf'"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n발행(기준)일: 2026년 1월 15일"
        from routers.doc_prep_main import _detect_and_process_annual_report

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await _detect_and_process_annual_report(
                doc_id="507f1f77bcf86cd799439011",
                full_text=text,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

        call_args = files_collection.update_one.call_args
        update_set = call_args[0][1]["$set"]
        assert update_set.get("displayName") == "홍길동_AR_2026-01-15.pdf"

    async def test_related_customer_id_as_objectid(self, files_collection):
        """기존 고객 발견 시 relatedCustomerId는 ObjectId로 저장 (customerId는 변경하지 않음)"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        from routers.doc_prep_main import _detect_and_process_annual_report

        existing_customer_id = str(ObjectId())
        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            # 기존 고객 검색 결과 (aims_api 응답 구조: data.customers)
            mock_search_resp = MagicMock()
            mock_search_resp.status_code = 200
            mock_search_resp.json.return_value = {
                "data": {
                    "customers": [{"_id": existing_customer_id, "personal_info": {"name": "홍길동"}}]
                }
            }
            mock_sse_resp = MagicMock(status_code=200)
            mock_client.get = AsyncMock(return_value=mock_search_resp)
            mock_client.post = AsyncMock(return_value=mock_sse_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _detect_and_process_annual_report(
                doc_id="507f1f77bcf86cd799439011",
                full_text=text,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

        call_args = files_collection.update_one.call_args
        update_set = call_args[0][1]["$set"]
        assert "relatedCustomerId" in update_set
        assert isinstance(update_set["relatedCustomerId"], ObjectId)


# ========================================
# CRS Detection
# ========================================

class TestCRSDetection:
    """CRS 텍스트 패턴 감지 정확성 테스트"""

    @pytest.fixture
    def files_collection(self):
        mock = AsyncMock()
        mock.update_one = AsyncMock()
        return mock

    async def _call_detect_crs(self, full_text, files_collection):
        from routers.doc_prep_main import _detect_and_process_customer_review

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            return await _detect_and_process_customer_review(
                doc_id=TEST_DOC_ID,
                full_text=full_text,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

    async def test_crs_pattern_match(self, crs_text_sample, files_collection):
        """필수('Customer Review Service') + 선택('변액') → CRS 감지"""
        result = await self._call_detect_crs(crs_text_sample, files_collection)
        assert result["is_customer_review"] is True

    async def test_crs_required_only(self, files_collection):
        """필수 키워드만, 선택 키워드 없음 → CRS 아님"""
        text = "This is a Customer Review Service document for testing."
        result = await self._call_detect_crs(text, files_collection)
        assert result["is_customer_review"] is False

    async def test_crs_customer_name_extraction(self, crs_text_sample, files_collection):
        """CRS 고객명 추출: 'Customer' 위 줄에서"""
        result = await self._call_detect_crs(crs_text_sample, files_collection)
        assert result["customer_name"] == "김철수"

    async def test_crs_product_name_extraction(self, crs_text_sample, files_collection):
        """CRS 상품명 추출: '발행' 위 줄에서"""
        result = await self._call_detect_crs(crs_text_sample, files_collection)
        assert result["product_name"] == "메트라이프 변액종합보험"

    async def test_crs_issue_date_extraction(self, crs_text_sample, files_collection):
        """CRS 발행일 추출"""
        result = await self._call_detect_crs(crs_text_sample, files_collection)
        assert result["issue_date"] == "2026-02-10"


# ========================================
# CRS DB Update
# ========================================

class TestCRSDBUpdate:
    """CRS 감지 후 DB 업데이트 검증"""

    @pytest.fixture
    def files_collection(self):
        mock = AsyncMock()
        mock.update_one = AsyncMock()
        return mock

    async def test_crs_flag_and_parsing_status(self, crs_text_sample, files_collection):
        """CRS 감지 시 is_customer_review=True, cr_parsing_status='pending'"""
        from routers.doc_prep_main import _detect_and_process_customer_review

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _detect_and_process_customer_review(
                doc_id="507f1f77bcf86cd799439011",
                full_text=crs_text_sample,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

        call_args = files_collection.update_one.call_args
        update_set = call_args[0][1]["$set"]
        assert update_set["is_customer_review"] is True
        assert update_set["cr_parsing_status"] == "pending"

    async def test_crs_display_name_with_product(self, crs_text_sample, files_collection):
        """displayName = '{고객명}_CRS_{상품명}_{YYYY-MM-DD}.pdf'"""
        from routers.doc_prep_main import _detect_and_process_customer_review

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await _detect_and_process_customer_review(
                doc_id="507f1f77bcf86cd799439011",
                full_text=crs_text_sample,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

        assert result["display_name"] == "김철수_CRS_메트라이프 변액종합보험_2026-02-10.pdf"

    async def test_crs_cr_metadata_stored(self, crs_text_sample, files_collection):
        """cr_metadata에 contractor_name, product_name, issue_date 저장"""
        from routers.doc_prep_main import _detect_and_process_customer_review

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"customers": []}
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=201, json=MagicMock(return_value={"_id": "c1"})))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _detect_and_process_customer_review(
                doc_id="507f1f77bcf86cd799439011",
                full_text=crs_text_sample,
                original_name="test.pdf",
                user_id="test_user",
                files_collection=files_collection,
            )

        call_args = files_collection.update_one.call_args
        update_set = call_args[0][1]["$set"]
        cr_meta = update_set["cr_metadata"]
        assert cr_meta["contractor_name"] == "김철수"
        assert cr_meta["product_name"] == "메트라이프 변액종합보험"
        assert cr_meta["issue_date"] == "2026-02-10"
