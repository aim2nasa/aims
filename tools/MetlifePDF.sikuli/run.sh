#!/bin/bash
# MetLife PDF 자동 다운로드 실행 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_usage() {
    echo ""
    echo "MetLife PDF 자동 다운로드 스크립트"
    echo "================================="
    echo ""
    echo "사용법:"
    echo "  ./run.sh [-e <날짜>] [-h]"
    echo ""
    echo "옵션:"
    echo "  -e, --end-date    계약 종료일 (형식: yyyy-MM-dd)"
    echo "                    기본값: 오늘 날짜"
    echo ""
    echo "  -h, --help        이 도움말 표시"
    echo ""
    echo "예시:"
    echo "  ./run.sh                        # 오늘 날짜로 실행"
    echo "  ./run.sh -e 2025-01-31          # 특정 종료일 지정"
    echo "  ./run.sh --end-date 2025-01-31  # 특정 종료일 지정"
    echo "  ./run.sh -h                     # 도움말 표시"
    echo ""
    echo "저장 경로: D:\\metpdf"
    echo ""
}

# 기본값: 오늘 날짜
END_DATE=$(date +%Y-%m-%d)

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -e|--end-date)
            END_DATE="$2"
            shift 2
            ;;
        *)
            echo "알 수 없는 옵션: $1"
            show_usage
            exit 1
            ;;
    esac
done

echo "종료일: $END_DATE"
export METLIFE_END_DATE="$END_DATE"

java -jar /opt/sikulix/sikulixide-2.0.5.jar -r "$SCRIPT_DIR"
