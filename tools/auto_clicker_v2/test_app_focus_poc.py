# -*- coding: utf-8 -*-
"""
App.focus("Chrome") PoC 테스트

실행 방법 (kitten 데스크탑에서):
  java -jar C:\SikuliX\sikulixide-2.0.5.jar -r test_app_focus_poc.py

테스트 시나리오:
  1. Chrome 창 제목 확인
  2. 다른 창(메모장) 열어서 포커스 빼앗기
  3. App.focus("Chrome") 호출하여 Chrome 복구
  4. 결과 판정 (Chrome이 최상위인지)
"""
import time

try:
    from sikuli import *
except ImportError:
    pass

print("=" * 50)
print("App.focus() PoC 테스트 시작")
print("=" * 50)

# --- Test 1: App.focus("Chrome") 기본 동작 ---
print("")
print("[Test 1] App.focus('Chrome') 호출")
try:
    result = App.focus("Chrome")
    print("  반환값: %s" % str(result))
    print("  타입: %s" % type(result).__name__)
    if result:
        try:
            print("  isRunning: %s" % result.isRunning())
            print("  getTitle: %s" % result.getTitle())
        except Exception as e2:
            print("  (속성 조회 실패: %s)" % str(e2))
    print("  결과: SUCCESS")
except Exception as e:
    print("  결과: EXCEPTION - %s" % str(e))

time.sleep(1)

# --- Test 2: 포커스 빼앗기 → 복구 테스트 ---
print("")
print("[Test 2] 포커스 탈취 후 복구 테스트")

# 메모장 열기 (포커스 빼앗기용)
print("  메모장 열기...")
try:
    notepad = App.open("notepad.exe")
    time.sleep(1)
    print("  메모장 열림 (Chrome 포커스 탈취됨)")
except Exception as e:
    print("  메모장 열기 실패: %s" % str(e))
    print("  (수동으로 다른 창을 클릭해서 포커스를 빼앗으세요)")
    time.sleep(3)

# Chrome 포커스 복구
print("  App.focus('Chrome') 호출...")
try:
    result = App.focus("Chrome")
    time.sleep(0.3)
    print("  결과: SUCCESS (Chrome이 최상위로 올라왔는지 육안 확인)")
except Exception as e:
    print("  결과: EXCEPTION - %s" % str(e))

    # Fallback: Alt+Tab
    print("  Alt+Tab fallback 시도...")
    try:
        type(Key.TAB, Key.ALT)
        time.sleep(0.3)
        print("  Alt+Tab: SUCCESS")
    except Exception as e2:
        print("  Alt+Tab: EXCEPTION - %s" % str(e2))

# 메모장 닫기
print("  메모장 닫기...")
try:
    App.close("notepad.exe")
except Exception:
    pass

# --- Test 3: "MetLife" 키워드 테스트 ---
print("")
print("[Test 3] App.focus('MetLife') 호출 (비교용)")
try:
    result = App.focus("MetLife")
    print("  반환값: %s" % str(result))
    if result:
        try:
            print("  isRunning: %s" % result.isRunning())
        except Exception:
            pass
    print("  결과: SUCCESS")
except Exception as e:
    print("  결과: EXCEPTION - %s" % str(e))

# --- 결과 요약 ---
print("")
print("=" * 50)
print("PoC 완료 — 위 결과를 확인하세요:")
print("  1. Test 1 SUCCESS → App.focus API 동작 확인")
print("  2. Test 2 메모장 열림 후 Chrome 복구 확인 (육안)")
print("  3. Test 3으로 Chrome vs MetLife 키워드 비교")
print("=" * 50)
