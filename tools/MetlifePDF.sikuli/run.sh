#!/bin/bash
# MetLife PDF 자동 다운로드 실행 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
java -jar /opt/sikulix/sikulixide-2.0.5.jar -r "$SCRIPT_DIR"
