# -*- coding: utf-8 -*-
"""
스크롤 검증 테스트 (OCR 없음, 빠름)
고객목록조회 화면에서 스크롤만 테스트
"""

# SikuliX 설정
Settings.ActionLogs = False
setFindFailedResponse(ABORT)

# 이미지
IMG_CUSTNAME = "1769233187438.png"         # 고객명 헤더
IMG_ARROW_DESC = "1769233198595.png"       # ↓ (내림차순 화살표)
IMG_ARROW_ASC = "1769233207559.png"        # ↑ (오름차순 화살표)

# 스크롤 설정
SCROLL_CLICKS = 5  # 15행 스크롤

print("=" * 50)
print(u"스크롤 검증 테스트 (OCR 없음)")
print("=" * 50)

###########################################
# 1단계: 고객목록조회 메뉴 진입
###########################################
print(u"\n[1단계] 고객목록조회 진입")

print(u"  [1-1] 메인 화면으로 이동...")
click("1769018868271.png")
sleep(3)

print(u"  [1-2] 고객관리 클릭...")
click("1769012299692.png")
sleep(5)

print(u"  [1-3] 고객등록 클릭...")
click("1769219913324.png")
sleep(3)

print(u"  [1-4] 고객목록조회 클릭...")
click("1769220000076.png")
sleep(5)

###########################################
# 2단계: ㄱ 초성 선택 및 정렬
###########################################
print(u"\n[2단계] ㄱ 초성 선택 및 내림차순 정렬")

print(u"  [2-1] ㄱ 버튼 클릭...")
click("1769222878862.png")
sleep(5)

# 내림차순 정렬
for attempt in range(3):
    if exists(IMG_ARROW_DESC, 2):
        print(u"  [2-2] 내림차순 확인됨")
        break
    print(u"  [2-2] 고객명 클릭 (%d차)..." % (attempt + 1))
    click(IMG_CUSTNAME)
    sleep(3)

# 스크롤 맨 위로
print(u"\n[3단계] 스크롤 맨 위로")
header = find(IMG_CUSTNAME)
click(header.right(500).below(200))
sleep(0.5)
type(Key.HOME, KeyModifier.CTRL)
sleep(1)
print(u"  스크롤 맨 위 완료")

###########################################
# 3단계: 스크롤 테스트
###########################################
print(u"\n[4단계] 스크롤 테스트 시작!")
print(u"  현재 화면 확인하세요 (첫 페이지)")
print(u"")
print(u"  3초 후 스크롤...")
sleep(3)

# 스크롤 실행 (휴대폰 컬럼 클릭 후 휠)
header = find(IMG_CUSTNAME)
# 휴대폰 컬럼: 고객명에서 오른쪽 600px (이메일 다음)
# 이메일은 링크라 클릭하면 안 되고, 휴대폰은 텍스트라 안전
scroll_area = header.right(600).below(150)
print(u"  [SCROLL] 휴대폰 컬럼 클릭 (포커스)...")
click(scroll_area)
sleep(0.5)

print(u"  [SCROLL] 휠 스크롤 5 steps...")
wheel(scroll_area, WHEEL_DOWN, 5)
sleep(2)

print(u"")
print("=" * 50)
print(u"스크롤 완료! 화면이 바뀌었는지 확인하세요.")
print(u"  - 바뀌었으면: 성공")
print(u"  - 그대로면: 실패")
print("=" * 50)
