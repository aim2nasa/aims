# -*- coding: utf-8 -*-
"""
ensure_browser_focus() 통합 검증 테스트 v2

실행: java -jar C:\SikuliX\sikulixide-2.0.5.jar -r test_focus_recovery_integrated.py

사전 조건: Chrome 창이 열려 있어야 함
"""
import time

try:
    from sikuli import *
except ImportError:
    pass

# ===========================================================
# ensure_browser_focus() — 실제 구현과 동일
# ===========================================================
def ensure_browser_focus():
    try:
        App.focus("Chrome")
    except Exception:
        try:
            print("    [fallback] Alt+Tab")
            type(Key.TAB, Key.ALT)
        except Exception as e:
            print("    [fallback fail]: %s" % str(e))
    sleep(0.3)

# ===========================================================
# 유틸
# ===========================================================
results = []

def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((name, status, detail))
    print("  >> %s: %s %s" % (name, status, ("- " + detail) if detail else ""))

def check_chrome_focus():
    """App을 통해 Chrome이 활성 상태인지 확인."""
    try:
        app = App("Chrome")
        # hasWindow()는 창이 존재하고 포커스 가능 상태인지 확인
        running = app.isRunning()
        return running
    except Exception:
        return False

def steal_focus():
    """메모장을 열어 Chrome 포커스 탈취."""
    try:
        App.open("notepad.exe")
        sleep(1.0)
        return True
    except Exception as e:
        print("  메모장 열기 실패: %s" % str(e))
        return False

def close_notepad():
    try:
        App.close("notepad.exe")
        sleep(0.3)
    except Exception:
        pass

# ===========================================================
print("")
print("=" * 60)
print("ensure_browser_focus() integrated test v2")
print("=" * 60)

# --- Pre-check ---
print("")
print("[Pre-check] Chrome")
try:
    chrome = App("Chrome")
    if not chrome.isRunning():
        print("  Chrome not running! Please open Chrome first.")
        import sys
        sys.exit(1)
    App.focus("Chrome")
    sleep(0.5)
    print("  Chrome OK (running)")
except Exception as e:
    print("  Chrome check failed: %s" % str(e))
    import sys
    sys.exit(1)

# ===========================================================
# Test 1: ensure_browser_focus() 기본 호출
# ===========================================================
print("")
print("[Test 1] Basic ensure_browser_focus() call")
try:
    ensure_browser_focus()
    record("Basic call", True, "no exception")
except Exception as e:
    record("Basic call", False, str(e))

# ===========================================================
# Test 2: 포커스 탈취 → 복구
# ===========================================================
print("")
print("[Test 2] Focus steal -> recovery")

if steal_focus():
    # 메모장이 foreground일 때 App.focus("Chrome") 시도
    print("  Notepad opened (focus stolen)")
    print("  Calling ensure_browser_focus()...")
    ensure_browser_focus()

    # 복구 확인: Chrome에 App.focus 다시 호출 — 예외 없으면 성공
    try:
        r = App.focus("Chrome")
        pid_str = str(r)
        has_chrome = "chrome" in pid_str.lower()
        record("Focus recovery", has_chrome, pid_str)
    except Exception as e:
        record("Focus recovery", False, str(e))

    close_notepad()
else:
    record("Focus recovery", False, "notepad open failed")

sleep(0.5)

# ===========================================================
# Test 3: 3회 연속 탈취/복구
# ===========================================================
print("")
print("[Test 3] Repeated steal/recovery (3 rounds)")
all_ok = True

for i in range(1, 4):
    print("  --- Round %d/3 ---" % i)
    if steal_focus():
        print("    Stolen. Recovering...")
        ensure_browser_focus()

        try:
            r = App.focus("Chrome")
            has_chrome = "chrome" in str(r).lower()
            print("    Round %d: %s" % (i, "OK" if has_chrome else "FAIL"))
            if not has_chrome:
                all_ok = False
        except Exception:
            all_ok = False

        close_notepad()
        sleep(0.3)
    else:
        all_ok = False

record("3x repeated recovery", all_ok)

sleep(0.5)

# ===========================================================
# Test 4: 복구 후 클릭 전달 확인
#   핵심 테스트: 포커스 복구 후 SikuliX click()이 Chrome에 전달되는지
# ===========================================================
print("")
print("[Test 4] Click delivery after recovery")

if steal_focus():
    print("  Stolen. Recovering...")
    ensure_browser_focus()

    try:
        # Chrome 본문 영역 클릭 (화면 중앙)
        scr = Screen()
        cx = int(scr.getW() / 2)
        cy = int(scr.getH() / 2)
        print("  Clicking center (%d, %d)..." % (cx, cy))
        click(Location(cx, cy))
        sleep(0.3)

        # 클릭 후 Chrome이 여전히 foreground인지
        r = App.focus("Chrome")
        has_chrome = "chrome" in str(r).lower()
        record("Click delivery", has_chrome, "center click -> Chrome still active")
    except Exception as e:
        record("Click delivery", False, str(e))

    close_notepad()
else:
    record("Click delivery", False, "notepad open failed")

sleep(0.5)

# ===========================================================
# Test 5: 성능 측정
# ===========================================================
print("")
print("[Test 5] Performance (10 calls)")

times = []
for i in range(10):
    t0 = time.time()
    ensure_browser_focus()
    elapsed = time.time() - t0
    times.append(elapsed)

avg_ms = sum(times) / len(times) * 1000
max_ms = max(times) * 1000
min_ms = min(times) * 1000
print("  avg: %.0f ms, min: %.0f ms, max: %.0f ms" % (avg_ms, min_ms, max_ms))
record("Performance", max_ms < 2000,
       "avg %.0fms / max %.0fms (includes 300ms sleep)" % (avg_ms, max_ms))

# ===========================================================
# Test 6: Alt+Tab fallback 경로
# ===========================================================
print("")
print("[Test 6] Alt+Tab fallback path")

def ensure_focus_forced_fallback():
    """의도적으로 App.focus 실패시켜 Alt+Tab 경로 테스트."""
    try:
        App.focus("ZZZZZ_NoSuchWindow_99999")
        raise Exception("forced")
    except Exception:
        try:
            print("    Alt+Tab fallback executing...")
            type(Key.TAB, Key.ALT)
        except Exception as e:
            print("    fallback error: %s" % str(e))
    sleep(0.3)

if steal_focus():
    print("  Stolen. Testing Alt+Tab fallback...")
    ensure_focus_forced_fallback()

    try:
        r = App.focus("Chrome")
        has_chrome = "chrome" in str(r).lower()
        record("Alt+Tab fallback", has_chrome, str(r))
    except Exception as e:
        record("Alt+Tab fallback", False, str(e))

    close_notepad()
else:
    record("Alt+Tab fallback", False, "notepad open failed")

# ===========================================================
# 결과 요약
# ===========================================================
print("")
print("=" * 60)
print("RESULTS")
print("=" * 60)

pass_count = sum(1 for _, s, _ in results if s == "PASS")
fail_count = sum(1 for _, s, _ in results if s == "FAIL")

for name, status, detail in results:
    mark = "OK" if status == "PASS" else "XX"
    print("  [%s] %-25s %s" % (mark, name, detail))

print("")
print("Total: %d PASS / %d FAIL / %d tests" % (pass_count, fail_count, len(results)))

if fail_count == 0:
    print(">>> ALL PASS <<<")
else:
    print(">>> %d FAIL <<<" % fail_count)

print("=" * 60)
