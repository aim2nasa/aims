#!/usr/bin/env python3
"""
PDF 메타데이터 인코딩 수정 스크립트
@since 2025-12-09

문제:
- 한국어 Windows에서 "Microsoft: Print To PDF"로 생성된 PDF 파일의 메타데이터가
  CP949/EUC-KR로 인코딩되어 있지만, PDF 표준에 맞지 않아 브라우저에서 깨져 보임

해결:
- 잘못된 인코딩을 감지하고 UTF-16BE (PDF 표준)로 재인코딩
"""

import os
import sys
import argparse
from typing import Optional, Tuple
import fitz  # PyMuPDF


def is_likely_garbled(text: str) -> bool:
    """
    텍스트가 인코딩 문제로 깨졌는지 판단

    CP949로 인코딩된 한글이 Latin-1로 잘못 해석되면
    0x80-0xFF 범위의 특수문자들이 나타남
    """
    if not text:
        return False

    # Latin-1 확장 문자 범위 (0x80-0xFF)의 비율 체크
    high_byte_chars = sum(1 for c in text if 0x80 <= ord(c) <= 0xFF)

    # 높은 비율의 high-byte 문자가 있고, 한글이 없으면 깨진 것으로 판단
    has_korean = any('\uAC00' <= c <= '\uD7AF' for c in text)
    high_ratio = high_byte_chars / len(text) if text else 0

    return high_ratio > 0.3 and not has_korean


def try_fix_encoding(garbled_text: str) -> Optional[str]:
    """
    깨진 텍스트를 올바른 한글로 복원 시도

    시도 순서:
    1. Latin-1 → bytes → CP949 (EUC-KR)
    2. Latin-1 → bytes → UTF-8

    주의: "Microsoft: Print To PDF"로 생성된 PDF는 메타데이터가
    근본적으로 손상되어 복원이 불가능한 경우가 많음.
    이 경우 None을 반환하고 파일명으로 대체해야 함.
    """
    if not garbled_text:
        return None

    encodings_to_try = ['cp949', 'euc-kr', 'utf-8', 'utf-16-le']

    for encoding in encodings_to_try:
        try:
            # Latin-1로 해석된 바이트를 다시 바이트로 변환
            raw_bytes = garbled_text.encode('latin-1')
            # 올바른 인코딩으로 디코딩 시도
            fixed_text = raw_bytes.decode(encoding)

            # 결과에 한글이 포함되어 있는지 확인
            korean_chars = [c for c in fixed_text if '\uAC00' <= c <= '\uD7AF']
            if not korean_chars:
                continue

            # 추가 검증: 한글 비율이 충분히 높아야 함 (최소 30%)
            # 그리고 이상한 제어문자가 없어야 함
            total_chars = len(fixed_text.replace(' ', ''))
            if total_chars == 0:
                continue

            korean_ratio = len(korean_chars) / total_chars
            has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in fixed_text)

            # 한글 비율 30% 이상, 제어문자 없음
            if korean_ratio >= 0.3 and not has_control_chars:
                # 마지막 검증: 결과가 "의미있는" 텍스트인지 확인
                # (연속된 이상한 한글 조합 필터링)
                # 일반적인 한글 문서 제목에는 특수문자가 과도하게 많지 않음
                special_char_count = sum(1 for c in fixed_text if not c.isalnum() and c not in ' ._-')
                if special_char_count <= len(fixed_text) * 0.3:
                    return fixed_text
        except (UnicodeDecodeError, UnicodeEncodeError):
            continue

    return None


def fix_pdf_metadata(pdf_path: str, dry_run: bool = False, replacement_title: Optional[str] = None) -> Tuple[bool, str]:
    """
    PDF 파일의 메타데이터 인코딩 수정

    전략:
    1. 깨진 메타데이터를 인코딩 변환으로 복원 시도
    2. 복원 실패 시 replacement_title 또는 파일명으로 대체

    Args:
        pdf_path: PDF 파일 경로
        dry_run: True면 실제 수정하지 않고 결과만 출력
        replacement_title: 복원 실패 시 사용할 대체 제목 (없으면 파일명 사용)

    Returns:
        (수정 여부, 메시지)
    """
    if not os.path.exists(pdf_path):
        return False, f"파일 없음: {pdf_path}"

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return False, f"PDF 열기 실패: {e}"

    metadata = doc.metadata
    modified = False
    changes = []

    # 수정이 필요한 메타데이터 필드들
    fields_to_check = ['title', 'author', 'subject', 'keywords', 'creator', 'producer']

    # 대체 제목 결정 (replacement_title > 파일명)
    fallback_title = replacement_title
    if not fallback_title:
        fallback_title = os.path.splitext(os.path.basename(pdf_path))[0]

    new_metadata = {}
    for field in fields_to_check:
        value = metadata.get(field, '')
        if value and is_likely_garbled(value):
            # 1차 시도: 인코딩 변환으로 복원
            fixed_value = try_fix_encoding(value)
            if fixed_value:
                new_metadata[field] = fixed_value
                changes.append(f"  {field}: '{value[:30]}' → '{fixed_value[:30]}' (encoding fixed)")
                modified = True
            # 2차 시도: title 필드는 대체 제목 사용
            elif field == 'title' and fallback_title:
                new_metadata[field] = fallback_title
                changes.append(f"  {field}: '{value[:30]}' → '{fallback_title}' (replaced)")
                modified = True
            else:
                # 복원 불가 - 빈 값으로 설정
                new_metadata[field] = ''
                changes.append(f"  {field}: '{value[:30]}' → '' (cleared)")
                modified = True
        else:
            new_metadata[field] = value

    if not modified:
        doc.close()
        return False, "수정 필요 없음"

    if dry_run:
        doc.close()
        return True, f"수정 예정:\n" + "\n".join(changes)

    # 실제 메타데이터 수정
    try:
        doc.set_metadata(new_metadata)
        doc.saveIncr()  # 증분 저장 (원본 구조 유지)
        doc.close()
        return True, f"수정 완료:\n" + "\n".join(changes)
    except Exception as e:
        doc.close()
        return False, f"저장 실패: {e}"


def fix_pdf_metadata_in_memory(pdf_bytes: bytes, original_filename: Optional[str] = None) -> Tuple[bytes, bool, str]:
    """
    메모리에서 PDF 메타데이터 수정 (업로드 파이프라인용)

    전략:
    1. 깨진 메타데이터를 인코딩 변환으로 복원 시도
    2. 복원 실패 시 original_filename으로 대체 (정공법)

    Args:
        pdf_bytes: PDF 파일 바이트
        original_filename: 원본 파일명 (MongoDB의 upload.originalName)

    Returns:
        (수정된 PDF 바이트, 수정 여부, 메시지)
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        return pdf_bytes, False, f"PDF 열기 실패: {e}"

    metadata = doc.metadata
    modified = False
    changes = []

    fields_to_check = ['title', 'author', 'subject', 'keywords', 'creator', 'producer']

    # 파일명에서 확장자 제거 (제목으로 사용)
    title_from_filename = None
    if original_filename:
        title_from_filename = os.path.splitext(original_filename)[0]

    new_metadata = {}
    for field in fields_to_check:
        value = metadata.get(field, '')
        if value and is_likely_garbled(value):
            # 1차 시도: 인코딩 변환으로 복원
            fixed_value = try_fix_encoding(value)
            if fixed_value:
                new_metadata[field] = fixed_value
                changes.append(f"{field}: encoding fixed")
                modified = True
            # 2차 시도: title 필드는 파일명으로 대체
            elif field == 'title' and title_from_filename:
                new_metadata[field] = title_from_filename
                changes.append(f"title: replaced with filename '{title_from_filename}'")
                modified = True
            else:
                # 복원 불가 - 빈 값으로 설정 (깨진 텍스트보다 나음)
                new_metadata[field] = ''
                changes.append(f"{field}: cleared (unrecoverable)")
                modified = True
        else:
            new_metadata[field] = value

    if not modified:
        result_bytes = pdf_bytes
        doc.close()
        return result_bytes, False, "No fix needed"

    try:
        doc.set_metadata(new_metadata)
        result_bytes = doc.tobytes(garbage=0, deflate=False)
        doc.close()
        return result_bytes, True, f"Fixed: {', '.join(changes)}"
    except Exception as e:
        doc.close()
        return pdf_bytes, False, f"Save failed: {e}"


def process_directory(directory: str, dry_run: bool = False) -> None:
    """
    디렉토리 내 모든 PDF 파일 처리
    """
    fixed_count = 0
    error_count = 0
    skip_count = 0

    for root, _, files in os.walk(directory):
        for filename in files:
            if filename.lower().endswith('.pdf'):
                filepath = os.path.join(root, filename)
                success, message = fix_pdf_metadata(filepath, dry_run)

                if success:
                    print(f"[FIXED] {filepath}")
                    print(message)
                    fixed_count += 1
                elif "수정 필요 없음" in message:
                    skip_count += 1
                else:
                    print(f"[ERROR] {filepath}: {message}")
                    error_count += 1

    print(f"\n=== 처리 완료 ===")
    print(f"수정됨: {fixed_count}")
    print(f"스킵: {skip_count}")
    print(f"오류: {error_count}")


def fix_pdf_with_mongodb(mongo_uri: str = "mongodb://localhost:27017", db_name: str = "aims", dry_run: bool = False) -> None:
    """
    MongoDB에서 원본 파일명을 조회하여 PDF 메타데이터 수정

    Args:
        mongo_uri: MongoDB 연결 URI
        db_name: 데이터베이스 이름
        dry_run: True면 실제 수정하지 않고 결과만 출력
    """
    try:
        from pymongo import MongoClient
    except ImportError:
        print("ERROR: pymongo가 설치되어 있지 않습니다. pip install pymongo")
        return

    client = MongoClient(mongo_uri)
    db = client[db_name]

    fixed_count = 0
    error_count = 0
    skip_count = 0

    # documents 컬렉션에서 PDF 파일 조회
    documents = db.documents.find({
        "upload.mimeType": "application/pdf"
    })

    for doc in documents:
        upload = doc.get('upload', {})
        storage_path = upload.get('path', '')
        original_name = upload.get('originalName', '')

        if not storage_path or not original_name:
            continue

        # 원본 파일명에서 확장자 제거
        title = os.path.splitext(original_name)[0]

        success, message = fix_pdf_metadata(storage_path, dry_run, replacement_title=title)

        if success:
            print(f"[FIXED] {storage_path}")
            print(f"  원본 파일명: {original_name}")
            print(message)
            fixed_count += 1
        elif "수정 필요 없음" in message:
            skip_count += 1
        else:
            print(f"[ERROR] {storage_path}: {message}")
            error_count += 1

    client.close()

    print(f"\n=== MongoDB 기반 처리 완료 ===")
    print(f"수정됨: {fixed_count}")
    print(f"스킵: {skip_count}")
    print(f"오류: {error_count}")


def main():
    parser = argparse.ArgumentParser(
        description='PDF 메타데이터 인코딩 수정 (CP949 → UTF-16BE)'
    )
    parser.add_argument('path', nargs='?', help='PDF 파일 또는 디렉토리 경로')
    parser.add_argument('--dry-run', '-n', action='store_true',
                        help='실제 수정하지 않고 결과만 출력')
    parser.add_argument('--recursive', '-r', action='store_true',
                        help='디렉토리 재귀 처리')
    parser.add_argument('--mongodb', '-m', action='store_true',
                        help='MongoDB에서 원본 파일명 조회하여 일괄 처리')
    parser.add_argument('--mongo-uri', default='mongodb://localhost:27017',
                        help='MongoDB 연결 URI (기본: mongodb://localhost:27017)')
    parser.add_argument('--db-name', default='aims',
                        help='데이터베이스 이름 (기본: aims)')
    parser.add_argument('--title', '-t',
                        help='대체할 제목 (단일 파일 처리 시)')

    args = parser.parse_args()

    # MongoDB 모드
    if args.mongodb:
        fix_pdf_with_mongodb(args.mongo_uri, args.db_name, args.dry_run)
        return

    # 경로가 없으면 에러
    if not args.path:
        parser.print_help()
        sys.exit(1)

    if os.path.isfile(args.path):
        success, message = fix_pdf_metadata(args.path, args.dry_run, args.title)
        print(f"{'[FIXED]' if success else '[SKIP/ERROR]'} {args.path}")
        print(message)
    elif os.path.isdir(args.path):
        if args.recursive:
            process_directory(args.path, args.dry_run)
        else:
            print("디렉토리 처리는 --recursive 옵션이 필요합니다")
            sys.exit(1)
    else:
        print(f"경로를 찾을 수 없음: {args.path}")
        sys.exit(1)


if __name__ == '__main__':
    main()
