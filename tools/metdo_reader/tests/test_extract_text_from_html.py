# -*- coding: utf-8 -*-
"""extract_text_from_html() 단위 테스트

Upstage OCR HTML 출력에서 클린 텍스트 추출 로직을 검증합니다.
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from read_customer import extract_text_from_html, parse_customer_info


class TestExtractTextFromHtml:
    """extract_text_from_html() 테스트"""

    def test_figure_figcaption_excluded(self):
        """figure/figcaption 내부 텍스트는 제외되어야 함"""
        html = (
            '<p id="0">헤더 텍스트</p>'
            '<figure id="1"><img src="test.png" />'
            '<figcaption><p class="figure-type">logo</p>'
            '<p class="figure-description">이미지 설명 텍스트</p>'
            '</figcaption></figure>'
            '<p id="2">본문 텍스트</p>'
        )
        text = extract_text_from_html(html)
        assert "헤더 텍스트" in text
        assert "본문 텍스트" in text
        assert "이미지 설명 텍스트" not in text
        assert "logo" not in text

    def test_nested_figure(self):
        """중첩된 figure 내부 텍스트도 모두 제외되어야 함"""
        html = (
            '<p>시작</p>'
            '<figure>'
            '<figure><figcaption><p>내부 설명1</p></figcaption></figure>'
            '<figcaption><p>외부 설명</p></figcaption>'
            '</figure>'
            '<p>끝</p>'
        )
        text = extract_text_from_html(html)
        assert "시작" in text
        assert "끝" in text
        assert "내부 설명1" not in text
        assert "외부 설명" not in text

    def test_block_element_newlines(self):
        """블록 요소(td, p, tr, br 등)에서 줄바꿈이 삽입되어야 함"""
        html = (
            '<table><tr><td>셀1</td><td>셀2</td></tr>'
            '<tr><td>셀3</td></tr></table>'
        )
        text = extract_text_from_html(html)
        # 각 셀이 별도 줄에 있어야 함
        assert "셀1" in text
        assert "셀2" in text
        assert "셀3" in text
        # 셀1과 셀2가 같은 줄에 있으면 안 됨
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        assert "셀1" in lines
        assert "셀2" in lines

    def test_colspan_no_repetition(self):
        """colspan이 있는 셀은 텍스트가 1번만 나타나야 함"""
        html = (
            '<table>'
            '<tr><td colspan="3">자택주소 18424 경기 화성시 동탄원천로</td></tr>'
            '<tr><td colspan="3">315-18, 755동 2301호</td></tr>'
            '</table>'
        )
        text = extract_text_from_html(html)
        # 주소가 1번만 나타남 (TEXT 출력의 3회 반복 문제 없음)
        assert text.count("18424") == 1
        assert text.count("755동") == 1

    def test_empty_html_returns_empty(self):
        """빈 HTML은 빈 문자열 반환"""
        assert extract_text_from_html("") == ""

    def test_header_and_footer_text(self):
        """header, footer 태그의 텍스트도 추출됨"""
        html = '<header>제목</header><footer>꼬리말</footer>'
        text = extract_text_from_html(html)
        assert "제목" in text
        assert "꼬리말" in text

    def test_br_produces_newline(self):
        """<br> 태그는 줄바꿈을 생성"""
        html = '<p>줄1<br>줄2<br/>줄3</p>'
        text = extract_text_from_html(html)
        assert "줄1" in text
        assert "줄2" in text
        assert "줄3" in text

    def test_consecutive_newlines_collapsed(self):
        """연속 빈 줄(3개 이상)이 2개로 정리됨"""
        html = '<p>A</p><p></p><p></p><p></p><p>B</p>'
        text = extract_text_from_html(html)
        assert "\n\n\n" not in text


class TestParseCustomerInfoHtmlPriority:
    """parse_customer_info()의 HTML 우선 로직 테스트"""

    def test_html_preferred_over_text(self):
        """HTML이 있으면 HTML에서 추출한 텍스트를 사용"""
        ocr_result = {
            "content": {
                "html": '<table><tr><td colspan="3">고객명 테스트고객 조회</td></tr>'
                        '<tr><td colspan="3">주민번호 * 900101-1****** 입력</td></tr></table>',
                "text": "고객명 | 테스트고객 | 조회 | 주민번호 | * 900101-1****** | 입력"
            }
        }
        result = parse_customer_info(ocr_result)
        assert result["name"] == "테스트고객"

    def test_text_fallback_when_no_html(self):
        """HTML이 없으면 TEXT로 폴백"""
        ocr_result = {
            "content": {
                "html": "",
                "text": "고객명 폴백고객 조회 주민번호 * 850515-2****** 입력"
            }
        }
        result = parse_customer_info(ocr_result)
        assert result["name"] == "폴백고객"

    def test_text_fallback_when_html_only_whitespace(self):
        """HTML이 공백만 있으면 TEXT로 폴백"""
        ocr_result = {
            "content": {
                "html": "   \n  ",
                "text": "고객명 공백HTML 조회"
            }
        }
        result = parse_customer_info(ocr_result)
        assert result["name"] == "공백HTML"

    def test_corporate_detection_from_html(self):
        """HTML에서 추출한 텍스트로 법인 감지"""
        ocr_result = {
            "content": {
                "html": '<table><tr><td colspan="3">법인명 테스트법인 조회 사업자번호 ★ 123-45-67890</td></tr></table>',
                "text": ""
            }
        }
        result = parse_customer_info(ocr_result)
        assert result["customer_type"] == "법인"
        assert result["name"] == "테스트법인"


class TestPipeRepetitionResolvedByHtml:
    """파이프 3중 반복 문제가 HTML 파싱으로 해결됨을 검증 (파일 의존성 없음)"""

    def test_pipe_repetition_resolved_by_html(self):
        """colspan=3 HTML은 텍스트 1회만 추출됨 (파이프 3중 반복 없음)"""
        html = (
            '<table>'
            '<tr><td colspan="3">자택주소 18424 경기 화성시 동탄원천로 315-18, '
            '755동 2301호 (능동,동탄능동상록예가)</td></tr>'
            '<tr><td colspan="3">직장전화 선택</td></tr>'
            '</table>'
        )
        text = extract_text_from_html(html)
        assert text.count("18424") == 1
        assert "|" not in text

    def test_home_address_no_label_prefix(self):
        """HTML → parse_customer_info 통합: 자택주소 라벨이 주소값에 포함되지 않음"""
        ocr_result = {
            "content": {
                "html": (
                    '<table>'
                    '<tr><td colspan="3">고객명 테스트 조회</td></tr>'
                    '<tr><td colspan="3">주민번호 * 900101-1****** 입력</td></tr>'
                    '<tr><td colspan="3">자택주소 18424 경기 화성시 동탄원천로 315-18</td></tr>'
                    '<tr><td colspan="3">직장주소 </td></tr>'
                    '</table>'
                ),
                "text": ""
            }
        }
        result = parse_customer_info(ocr_result)
        assert result.get("home_address") is not None
        assert not result["home_address"].startswith("자택주소")
        assert "18424" in result["home_address"]

    def test_work_address_ends_before_fax(self):
        """직장주소 end_labels: 팩스번호 앞에서 올바르게 잘림"""
        ocr_result = {
            "content": {
                "html": (
                    '<table>'
                    '<tr><td colspan="3">고객명 테스트직원 조회</td></tr>'
                    '<tr><td colspan="3">주민번호 * 850515-2****** 입력</td></tr>'
                    '<tr><td colspan="3">자택주소 </td></tr>'
                    '<tr><td colspan="3">직장주소 04214 서울 마포구 만리재로 15, 1310호</td></tr>'
                    '<tr><td colspan="3">팩스번호 선택</td></tr>'
                    '<tr><td colspan="3">직장명 테스트회사</td></tr>'
                    '</table>'
                ),
                "text": ""
            }
        }
        result = parse_customer_info(ocr_result)
        assert result.get("work_address") is not None
        assert "04214" in result["work_address"]
        assert "팩스번호" not in (result["work_address"] or "")
        assert "직장명" not in (result["work_address"] or "")


class TestRealOcrValidation:
    """실제 OCR 결과로 검증 (파일이 있을 때만 실행)"""

    def test_namgung_hyun_html_parsing(self):
        """남궁현: HTML 파싱으로 주소 파이프 문제 해결 확인"""
        json_path = os.path.join("D:", os.sep, "tmp", "ocr_original_fullpage.json")
        if not os.path.exists(json_path):
            return  # 파일 없으면 스킵

        with open(json_path, "r", encoding="utf-8") as f:
            ocr = json.load(f)

        result = parse_customer_info(ocr)

        assert result["name"] == "남궁현"
        assert result["birth_date"] == "1970.07.22"
        assert result["mobile_phone"] == "010-3323-2361"
        assert result["home_phone"] == "031-981-1201"
        assert result["email"] == "nkh1616@gg.go.kr"
        # 핵심: 주소에 파이프(|)가 없어야 함
        assert "|" not in (result["home_address"] or "")
        assert "동탄원천로" in result["home_address"]
        assert "755동 2301호" in result["home_address"]
        assert "상록예가" in result["home_address"]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
