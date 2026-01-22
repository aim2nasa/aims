# -*- coding: utf-8 -*-
# MetLife PDF 자동 다운로드
# SikuliX 스크립트

import os
import time

# 설정
SAVE_BASE_PATH = "D:\\metpdf"
WAIT_TIME = 2
WAIT_TIME_LONG = 5

# 저장 폴더 생성
if not os.path.exists(SAVE_BASE_PATH):
    os.makedirs(SAVE_BASE_PATH)

###########################################
# 1단계: 초기 설정
###########################################

# 메인 화면으로 이동
click("1769018868271.png")
sleep(WAIT_TIME)

# 1. 고객관리 클릭
click("1769012299692.png")
sleep(1)

# 2. 계약정보 클릭
click("1769014697731.png")
sleep(1)

# 3. 계약사항조회 클릭
click("1769012548055.png")
sleep(WAIT_TIME)

# 4. 종료일 필드 클릭 후 날짜 입력
click("1769012774971.png")
type("a", Key.CTRL)
type("2020-01-20")
sleep(1)

# 5. 모집/이양 드롭다운 클릭
click("1769014868968.png")
sleep(1)

# 6. 모집 선택
click("1769013031345.png")
sleep(1)

# 7. 조회 버튼 클릭
click("1769012870336.png")
sleep(WAIT_TIME)

# 8. 피보험자 칼럼 클릭 (정렬)
click("1769013114864.png")
sleep(WAIT_TIME)

print("1단계 완료: 초기 설정 끝")

###########################################
# 2단계: 첫 번째 고객 처리 (테스트)
###########################################

print("첫 번째 고객 처리 시작")

# 목록 첫 번째 행 클릭 (피보험자 칼럼 아래)
click(Pattern("1769013114864.png").targetOffset(0, 25))
sleep(3)

# 고객통합뷰 클릭
click("1769016361393.png")
sleep(WAIT_TIME_LONG)

# 스크롤 맨 위로
wheel(WHEEL_UP, 10)
sleep(2)

# 변액보험리포트 클릭
click("1769013238788.png")
sleep(WAIT_TIME)

# 리포트 첫 번째 항목 클릭
click("1769017138001.png")
sleep(1)

# 선택 버튼 클릭
click("1769013332392.png")
sleep(WAIT_TIME)

# 계약사항및기타 체크
click("1769013368545.png")
sleep(0.5)

# 펀드이력관리 체크
click("1769013393100.png")
sleep(0.5)

# > 버튼 클릭
click("1769013422226.png")
sleep(1)

# 미리보기 클릭
click("1769013443821.png")
wait("1769013494879.png", 30)

# PDF 저장 버튼 클릭
click("1769013494879.png")
sleep(WAIT_TIME)

# 저장(S) 버튼 클릭
click("1769013531968.png")
sleep(WAIT_TIME)

# PDF 닫기 (Alt+F4)
type(Key.F4, Key.ALT)
sleep(1)

# 예(Y) 클릭
click("1769013568800.png")
sleep(1)

# 보고서인쇄창 X 클릭
click("1769013600633.png")
sleep(1)

# 변액보험리포트 팝업 X 클릭
click("1769013644108.png")
sleep(1)

# Annual Report 클릭
click("1769013275483.png")
wait("1769013494879.png", 30)

# PDF 저장 버튼 클릭
click("1769013494879.png")
sleep(WAIT_TIME)

# 저장(S) 버튼 클릭
click("1769013531968.png")
sleep(WAIT_TIME)

# PDF 닫기 (Alt+F4)
type(Key.F4, Key.ALT)
sleep(1)

# 예(Y) 클릭
click("1769013568800.png")
sleep(1)

print("첫 번째 고객 처리 완료")