"""
PDF 처리 유틸리티 함수
PDF 페이지 읽기, 텍스트 추출, N페이지 동적 탐지
"""
import logging
import os

try:
    import pdfplumber
    import PyPDF2
except ImportError as e:
    logging.error(f"PDF 라이브러리 import 실패: {e}")
    raise

logger = logging.getLogger(__name__)


def get_page_count(pdf_path: str) -> int:
    """
    PDF 파일의 전체 페이지 수 반환

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        int: 페이지 수

    Raises:
        FileNotFoundError: 파일이 존재하지 않을 때
        Exception: PDF 읽기 실패
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            page_count = len(pdf_reader.pages)
            logger.info(f"PDF 페이지 수: {page_count} ({os.path.basename(pdf_path)})")
            return page_count
    except Exception as e:
        logger.error(f"PDF 페이지 수 가져오기 실패: {e}")
        raise


def extract_text_from_page(pdf_path: str, page_num: int) -> str:
    """
    PDF 특정 페이지에서 텍스트 추출 (0-indexed)

    Args:
        pdf_path: PDF 파일 경로
        page_num: 페이지 번호 (0부터 시작)

    Returns:
        str: 추출된 텍스트

    Raises:
        FileNotFoundError: 파일이 존재하지 않을 때
        IndexError: 페이지 번호가 범위를 벗어날 때
        Exception: 텍스트 추출 실패
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    try:
        # pdfplumber 사용 (더 정확한 텍스트 추출)
        with pdfplumber.open(pdf_path) as pdf:
            if page_num < 0 or page_num >= len(pdf.pages):
                raise IndexError(f"페이지 번호 범위 초과: {page_num} (총 {len(pdf.pages)}페이지)")

            page = pdf.pages[page_num]
            text = page.extract_text() or ""

            logger.debug(f"페이지 {page_num + 1} 텍스트 추출 완료: {len(text)} 글자")
            return text

    except Exception as e:
        logger.error(f"텍스트 추출 실패 (페이지 {page_num}): {e}")

        # Fallback: PyPDF2 시도
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                if page_num < 0 or page_num >= len(pdf_reader.pages):
                    raise IndexError(f"페이지 번호 범위 초과: {page_num}")

                page = pdf_reader.pages[page_num]
                text = page.extract_text() or ""

                logger.debug(f"PyPDF2로 페이지 {page_num + 1} 텍스트 추출 완료: {len(text)} 글자")
                return text

        except Exception as fallback_error:
            logger.error(f"Fallback 텍스트 추출도 실패: {fallback_error}")
            raise


def extract_text_from_pages(pdf_path: str, start_page: int, end_page: int) -> str:
    """
    PDF 여러 페이지에서 텍스트 추출 (0-indexed)

    Args:
        pdf_path: PDF 파일 경로
        start_page: 시작 페이지 (0부터 시작)
        end_page: 종료 페이지 (포함)

    Returns:
        str: 추출된 텍스트 (페이지별로 개행 구분)

    Raises:
        FileNotFoundError: 파일이 존재하지 않을 때
        Exception: 텍스트 추출 실패
    """
    texts = []
    for page_num in range(start_page, end_page + 1):
        try:
            text = extract_text_from_page(pdf_path, page_num)
            texts.append(text)
        except Exception as e:
            logger.warning(f"페이지 {page_num + 1} 추출 실패 (건너뜀): {e}")
            continue

    combined_text = "\n\n".join(texts)
    logger.info(f"페이지 {start_page + 1}~{end_page + 1} 텍스트 추출 완료: {len(combined_text)} 글자")
    return combined_text


def find_contract_table_end_page(pdf_path: str) -> int:
    """
    '주요 보장내용 현황 (요약)' 섹션 이전 페이지 찾기
    계약 테이블이 끝나는 페이지를 동적으로 탐지

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        int: 계약 테이블 마지막 페이지 번호 (0-indexed)
             찾지 못하면 기본값 2 (3페이지) 반환

    Raises:
        FileNotFoundError: 파일이 존재하지 않을 때
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    try:
        total_pages = get_page_count(pdf_path)

        # 종료 키워드 목록 (띄어쓰기 변형 포함)
        end_keywords = [
            "주요 보장내용 현황",
            "주요보장내용현황",
            "주요 보장내용현황",
            "주요보장내용 현황",
            "보장내용 현황 (요약)",
            "보장내용현황(요약)"
        ]

        # 2페이지부터 검색 (0-indexed: 페이지 2 = 3번째 페이지)
        # 최대 10페이지까지만 검색 (성능 최적화)
        for page_num in range(2, min(total_pages, 10)):
            try:
                text = extract_text_from_page(pdf_path, page_num)

                # 키워드 체크
                for keyword in end_keywords:
                    if keyword in text:
                        logger.info(f"계약 테이블 종료 감지: 페이지 {page_num + 1} (키워드: '{keyword}')")
                        # 이전 페이지까지가 계약 테이블
                        return page_num - 1

            except Exception as e:
                logger.warning(f"페이지 {page_num + 1} 검색 중 에러 (건너뜀): {e}")
                continue

        # 키워드를 찾지 못한 경우 기본값 반환
        logger.warning("계약 테이블 종료 페이지를 찾지 못했습니다. 기본값(2) 사용")
        return 2  # 기본값: 3페이지 (0-indexed: 2)

    except Exception as e:
        logger.error(f"N페이지 탐지 실패: {e}")
        # 에러 발생 시에도 기본값 반환
        return 2


def validate_pdf_file(pdf_path: str) -> dict:
    """
    PDF 파일 유효성 검증

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        dict: {
            "valid": bool,
            "error": str (optional),
            "page_count": int (optional),
            "file_size": int (optional)
        }
    """
    result = {"valid": False}

    try:
        # 파일 존재 확인
        if not os.path.exists(pdf_path):
            result["error"] = "파일이 존재하지 않습니다"
            return result

        # 파일 크기 확인
        file_size = os.path.getsize(pdf_path)
        if file_size == 0:
            result["error"] = "파일 크기가 0입니다"
            return result

        result["file_size"] = file_size

        # PDF 읽기 테스트
        page_count = get_page_count(pdf_path)
        if page_count == 0:
            result["error"] = "페이지가 없는 PDF입니다"
            return result

        result["page_count"] = page_count
        result["valid"] = True

        logger.info(f"PDF 유효성 검증 성공: {os.path.basename(pdf_path)} ({page_count}페이지, {file_size}바이트)")
        return result

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"PDF 유효성 검증 실패: {e}")
        return result
