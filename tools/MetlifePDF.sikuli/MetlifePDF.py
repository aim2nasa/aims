# -*- coding: utf-8 -*-
# MetLife PDF 자동 다운로드
# SikuliX 스크립트

import os
import time

# SikuliX 설정
Settings.ActionLogs = False  # [log] CLICK 메시지 숨김
setFindFailedResponse(ABORT)  # 이미지 못 찾으면 즉시 중단

# 헬퍼 함수: 이미지 못 찾으면 즉시 종료
def must_find(img):
    """이미지가 반드시 있어야 함. 없으면 즉시 종료."""
    if not exists(img):
        print("[ERROR] 이미지를 찾을 수 없음: " + img)
        exit(1)
    return True

def find_any(*imgs):
    """여러 이미지 중 하나라도 있으면 해당 이미지 반환. 모두 없으면 종료."""
    for img in imgs:
        if exists(img):
            return img
    print("[ERROR] 다음 이미지 중 하나도 찾을 수 없음: " + str(imgs))
    exit(1)

# 설정
SAVE_BASE_PATH = "D:\\metpdf"
WAIT_TIME = 3
WAIT_TIME_LONG = 5

# 저장 폴더 생성
if not os.path.exists(SAVE_BASE_PATH):
    os.makedirs(SAVE_BASE_PATH)

print("=" * 50)
print("MetLife PDF 자동 다운로드 시작")
print("=" * 50)

start_time = time.time()

###########################################
# 1단계: 초기 설정
###########################################
print("\n[1단계] 초기 설정")

print("  [1-1] 메인 화면으로 이동...")
click("img/1769018868271.png")
sleep(WAIT_TIME)

print("  [1-2] 고객관리 클릭...")
click("img/1769012299692.png")
sleep(3)  # 서브메뉴 열릴 시간 확보

print("  [1-3] 계약정보 클릭...")
click("img/1769014697731.png")
sleep(3)

print("  [1-4] 계약사항조회 클릭...")
click("img/1769012548055.png")
sleep(5)  # 페이지 로딩 대기

print("  [1-5] 초기화 버튼 클릭...")
click("img/1769097064941.png")
sleep(3)

print("  [1-6] 종료일 필드에 날짜 입력...")
# 환경변수에서 종료일 가져오기 (없으면 오늘 날짜)
end_date = os.environ.get("METLIFE_END_DATE", time.strftime("%Y-%m-%d"))
print("        -> 종료일: " + end_date)
# 1769095658706.png = ~ (물결) 기호, 오른쪽 80px = 종료일 필드
click(Pattern("img/1769095658706.png").targetOffset(80, 0))
type("a", Key.CTRL)
type(end_date)
type(Key.TAB)  # 포커스를 다음 필드로 이동
sleep(3)

print("  [1-7] 모집/이양 드롭다운 설정...")
# 무조건 드롭다운 열고 "모집" 선택 (상태 확인 안함 - 오류 방지)
# 1769097475678.png = "모집/이양" 텍스트, 오른쪽 85px = ALL 드롭다운
click(Pattern("img/1769097475678.png").targetOffset(85, 0))  # 드롭다운 클릭
print("        -> 드롭다운 클릭 완료, 메뉴 대기 중...")
sleep(3)  # 드롭다운 메뉴가 열릴 시간 충분히 확보

# "모집" 옵션이 나타날 때까지 대기 (최대 5초)
if not exists("img/1769013031345.png", 5):
    print("[ERROR] 드롭다운 메뉴에서 '모집' 옵션을 찾을 수 없음!")
    print("        -> 드롭다운이 제대로 열리지 않았거나 이미지 재캡처 필요")
    exit(1)

click("img/1769013031345.png")  # "모집" 선택
sleep(3)
print("        -> '모집' 선택 완료")

# 모집 선택 검증
print("        -> 모집 선택 검증...")
if not exists("img/1769096267333.png"):
    print("[ERROR] 모집/이양 드롭다운 설정 실패! 중단.")
    exit(1)
print("        -> 검증 완료")

print("  [1-8] 조회 버튼 클릭...")
click("img/1769012870336.png")
sleep(7)  # 조회 결과 로딩 대기

# 조회 결과 없음 팝업 체크
if exists("img/1769096914249.png"):
    print("[ERROR] 조회 결과가 없습니다! 중단.")
    exit(1)

print("  [1-9] 피보험자 칼럼 정렬 확인...")
# 1769013114864.png = 내림차순 (화살표 ↓) - 원하는 상태
# 1769095061022.png = 오름차순 (화살표 ↑)
# 1769095119885.png = 정렬 안됨 (화살표 없음)
found_img = find_any("img/1769013114864.png", "img/1769095061022.png", "img/1769095119885.png")
if found_img == "img/1769013114864.png":
    print("        -> 이미 내림차순 정렬됨, 스킵")
elif found_img == "img/1769095061022.png":
    print("        -> 오름차순 상태, 클릭하여 내림차순으로...")
    click(found_img)
    sleep(5)
else:
    print("        -> 정렬 안됨, 클릭...")
    click(found_img)
    sleep(5)

# 정렬 후 검증: 내림차순 상태인지 확인
print("        -> 정렬 상태 검증...")
sleep(3)
if not exists("img/1769013114864.png"):
    print("[ERROR] 내림차순 정렬 실패! 피보험자↓ 이미지 없음. 중단.")
    exit(1)
print("        -> 검증 완료: 내림차순 정렬됨")

print("[1단계 완료]")

###########################################
# 2단계: 첫 번째 고객 처리 (테스트)
###########################################
print("\n[2단계] 첫 번째 고객 처리")

print("  [2-1] 목록 첫 번째 행 클릭...")
click(Pattern("img/1769013114864.png").targetOffset(0, 25))
sleep(3)

print("  [2-2] 고객통합뷰 클릭...")
click("img/1769016361393.png")
sleep(WAIT_TIME_LONG)

print("  [2-3] 스크롤 맨 위로...")
wheel(WHEEL_UP, 10)
sleep(3)

print("  [2-4] 변액보험리포트 클릭...")
click("img/1769013238788.png")
sleep(WAIT_TIME)

print("  [2-5] 리포트 첫 번째 항목 클릭...")
click("img/1769017138001.png")
sleep(3)

print("  [2-6] 선택 버튼 클릭...")
click("img/1769013332392.png")
sleep(WAIT_TIME)

print("  [2-7] 계약사항및기타 체크...")
click("img/1769013368545.png")
sleep(2)

print("  [2-8] 펀드이력관리 체크...")
click("img/1769013393100.png")
sleep(2)

print("  [2-9] > 버튼 클릭...")
click("img/1769013422226.png")
sleep(3)

print("  [2-10] 미리보기 클릭...")
click("img/1769013443821.png")
print("        -> PDF 로딩 대기 (최대 30초)...")
wait("img/1769013494879.png", 30)

print("  [2-11] PDF 저장 버튼 클릭...")
click("img/1769013494879.png")
sleep(WAIT_TIME)

print("  [2-12] 저장(S) 버튼 클릭...")
click("img/1769013531968.png")
sleep(WAIT_TIME)

# 파일 덮어쓰기 확인 다이얼로그 체크
if exists("img/1769099551754.png", 3):
    print("        -> 동일 파일 존재, 덮어쓰기 취소")
    click("img/1769099551754.png")  # 아니요(N) 클릭
    sleep(WAIT_TIME)
    click("img/1769099662780.png")  # 취소 버튼 클릭
    sleep(WAIT_TIME)

print("  [2-13] PDF 닫기 (Alt+F4)...")
type(Key.F4, Key.ALT)
sleep(3)

print("  [2-14] 예(Y) 클릭...")
click("img/1769013568800.png")
sleep(3)

print("  [2-15] 보고서인쇄창 X 클릭...")
click("img/1769013600633.png")
sleep(3)

print("  [2-16] 변액보험리포트 팝업 X 클릭...")
click("img/1769013644108.png")
sleep(3)

print("[변액보험리포트 저장 완료]")

###########################################
# 3단계: Annual Report 다운로드
###########################################
print("\n[3단계] Annual Report 다운로드")

print("  [3-1] Annual Report 클릭...")
click("img/1769013275483.png")
print("        -> PDF 로딩 대기 (최대 30초)...")
wait("img/1769013494879.png", 30)

print("  [3-2] PDF 저장 버튼 클릭...")
click("img/1769013494879.png")
sleep(WAIT_TIME)

print("  [3-3] 저장(S) 버튼 클릭...")
click("img/1769013531968.png")
sleep(WAIT_TIME)

# 파일 덮어쓰기 확인 다이얼로그 체크
if exists("img/1769099551754.png", 3):
    print("        -> 동일 파일 존재, 덮어쓰기 취소")
    click("img/1769099551754.png")  # 아니요(N) 클릭
    sleep(WAIT_TIME)
    click("img/1769099662780.png")  # 취소 버튼 클릭
    sleep(WAIT_TIME)

print("  [3-4] PDF 닫기 (Alt+F4)...")
type(Key.F4, Key.ALT)
sleep(3)

print("  [3-5] 예(Y) 클릭...")
click("img/1769013568800.png")
sleep(3)

print("[Annual Report 저장 완료]")

elapsed_time = time.time() - start_time
minutes = int(elapsed_time // 60)
seconds = int(elapsed_time % 60)

print("\n" + "=" * 50)
print("모든 작업 완료!")
print("소요 시간: %d분 %d초" % (minutes, seconds))
print("=" * 50)
