# -*- coding: utf-8 -*-
"""
scroll_to_top 함수 테스트
"""

from sikuli import *
from java.awt import Robot
from java.awt.event import KeyEvent

IMG_CUSTNAME = "img/1769233187438.png"
_robot = Robot()


def scroll_to_top(header, max_pageup=20):
    """Java Robot의 Page Up 키로 스크롤을 맨 위로 이동"""
    click(header.right(300).below(150))
    sleep(0.3)
    for i in range(max_pageup):
        _robot.keyPress(KeyEvent.VK_PAGE_UP)
        _robot.keyRelease(KeyEvent.VK_PAGE_UP)
        sleep(0.1)
    sleep(0.5)


print(u"\n>>> 스크롤을 아래로 내려두세요!")
print(u">>> 3초 후 scroll_to_top 실행...")
sleep(3)

header = find(IMG_CUSTNAME)
print(u"[1] 헤더 찾음")

print(u"[2] scroll_to_top 실행...")
scroll_to_top(header)

print(u"[완료] 스크롤이 맨 위로 이동했나요?")
