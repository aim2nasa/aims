# -*- coding: utf-8 -*-
"""
스크롤 캘리브레이션 테스트 (OCR 없음)
목적: 15행 스크롤 시 필요한 휠 클릭 수 확인

사용법:
  1. 고객목록조회 화면에서 실행 (ㄱ 초성, 내림차순 정렬 상태)
  2. 스크롤 전: 15번째 고객 = 강정모
  3. 스크롤 후: 1번째 고객 = 강지선 (16번째)이어야 함
  4. 사용자가 직접 화면 확인
"""

import os

# SikuliX 설정
Settings.ActionLogs = False
setFindFailedResponse(ABORT)

# 테스트 설정 - 이 값을 조정하며 테스트
SCROLL_CLICKS = int(os.environ.get("SCROLL_CLICKS", "5"))

# 고객명 헤더 이미지 (스크롤 위치 기준점)
IMG_CUSTNAME = "1769233187438.png"


def scroll_down(steps):
    """스크롤바 영역 클릭 후 휠 스크롤"""
    header = find(IMG_CUSTNAME)

    # 스크롤바 영역 (오른쪽 끝) 클릭 - 데이터 행 클릭 방지
    scrollbar_area = header.right(1300).below(300)
    print(u"[SCROLL] 스크롤바 영역 클릭 (포커스)...")
    click(scrollbar_area)
    sleep(0.5)

    # 휠 스크롤
    print(u"[SCROLL] 휠 스크롤 %d steps..." % steps)
    wheel(scrollbar_area, WHEEL_DOWN, steps)
    sleep(1)


print("=" * 50)
print(u"스크롤 캘리브레이션 테스트")
print(u"SCROLL_CLICKS = %d" % SCROLL_CLICKS)
print("=" * 50)
print(u"")
print(u"[검증 방법]")
print(u"  스크롤 전: 15번 = 강정모")
print(u"  스크롤 후: 1번 = 강지선 (원래 16번)")
print(u"")
print(u"3초 후 스크롤 실행...")
sleep(3)

scroll_down(SCROLL_CLICKS)

print(u"")
print(u"[완료] 화면을 확인하세요.")
print(u"  - 강지선이 첫 번째 행에 있으면 성공")
print(u"  - 겹치면: SCROLL_CLICKS 증가")
print(u"  - 건너뛰면: SCROLL_CLICKS 감소")
print("=" * 50)
