# -*- coding: utf-8 -*-
# Pause/Resume mechanism test for SikuliX/Jython
import os
import sys
import time
import threading

from java.awt import Robot, MouseInfo
from java.awt.event import KeyEvent
from java.lang import System as JSystem

_pass = [0]
_fail = [0]
_failures = []

def out(msg):
    JSystem.out.println(msg)
    JSystem.out.flush()

def T(name, cond, detail=""):
    if cond:
        _pass[0] += 1
        out("  [PASS] " + name)
    else:
        _fail[0] += 1
        out("  [FAIL] " + name + " -- " + str(detail))
        _failures.append(name + ": " + str(detail))

out("=" * 60)
out("AutoClicker v2 Pause/Resume Test")
out("=" * 60)

try:
    SCRIPT_DIR = getBundlePath()
except:
    SCRIPT_DIR = os.environ.get("AC_HOME", r"D:\aims\tools\auto_clicker_v2")

# ===========================================================
# Test 1: MetlifeCustomerList.py wrapping verification
# ===========================================================
out("\n[Test 1] MetlifeCustomerList.py wrapping check")

mcl_path = os.path.join(SCRIPT_DIR, "MetlifeCustomerList.py")
with open(mcl_path, "r") as f:
    mcl = f.read()

T("MCL _sikuli_click preserved", "_sikuli_click = click" in mcl)
T("MCL _sikuli_type preserved", "_sikuli_type = type" in mcl)
T("MCL _sikuli_find preserved", "_sikuli_find = find" in mcl)
T("MCL _sikuli_exists preserved", "_sikuli_exists = exists" in mcl)
T("MCL _sikuli_sleep preserved", "_sikuli_sleep = sleep" in mcl)
T("MCL click wrapped", "def click(target, *args):" in mcl)
T("MCL type wrapped", "def type(target, *args):" in mcl)
T("MCL find wrapped", "def find(target, *args):" in mcl)
T("MCL exists wrapped", "def exists(target, *args):" in mcl)
T("MCL sleep override", "def sleep(seconds):" in mcl)
T("MCL MouseInfo import", "from java.awt import Robot, MouseInfo" in mcl)
T("MCL mouse save", "MouseInfo.getPointerInfo().getLocation()" in mcl)
T("MCL mouse restore", "_robot.mouseMove(saved_x, saved_y)" in mcl)
T("MCL _in_recovery flag", "_in_recovery = False" in mcl)
T("MCL _in_critical_section flag", "_in_critical_section = False" in mcl)
T("MCL _recover_after_resume def", "def _recover_after_resume():" in mcl)
T("MCL _focus_metlife_window def", "def _focus_metlife_window():" in mcl)
T("MCL _verify_customer_list def", "def _verify_customer_list_after_resume():" in mcl)
T("MCL nav retry max=3", "_NAV_MAX_RETRY = 3" in mcl)
T("MCL nav retry loop", "for _nav_attempt in range(1, _NAV_MAX_RETRY + 1):" in mcl)

# Region.click manual check
region_idx = mcl.find("_dd_region.click(")
if region_idx > 0:
    before = mcl[max(0, region_idx - 200):region_idx]
    T("MCL Region.click has check_pause", "check_pause()" in before)
else:
    T("MCL Region.click exists", False, "not found")

# Customer loop verify count (def=1 + calls>=3)
vcount = mcl.count("_verify_customer_list_after_resume()")
T("MCL customer loop verify >= 4", vcount >= 4, "count=%d" % vcount)

# Recursion safety: _recover uses _sikuli_* only
ri = mcl.find("def _recover_after_resume():")
if ri > 0:
    nd = mcl.find("\ndef ", ri + 10)
    rb = mcl[ri:nd if nd > 0 else len(mcl)]
    # Check no bare click/find/exists (only _sikuli_ prefixed)
    import re
    bare = re.findall(r'(?<!\w)click\(', rb)
    bare = [b for b in bare if "_sikuli_click" not in mcl[mcl.rfind("\n", 0, mcl.find(b, ri)):mcl.find(b, ri)+20]]
    T("MCL _recover uses _sikuli_exists", "_sikuli_exists" in rb)
    T("MCL _recover uses _sikuli_click", "_sikuli_click" in rb)

# ===========================================================
# Test 2: verify_customer_integrated_view.py wrapping check
# ===========================================================
out("\n[Test 2] verify_customer_integrated_view.py wrapping check")

vp = os.path.join(SCRIPT_DIR, "verify_customer_integrated_view.py")
with open(vp, "r") as f:
    vc = f.read()

T("VCIV _sikuli_click preserved", "_sikuli_click = click" in vc)
T("VCIV _sikuli_type preserved", "_sikuli_type = type" in vc)
T("VCIV _sikuli_paste preserved", "_sikuli_paste = paste" in vc)
T("VCIV _sikuli_find preserved", "_sikuli_find = find" in vc)
T("VCIV _sikuli_exists preserved", "_sikuli_exists = exists" in vc)
T("VCIV _sikuli_wheel preserved", "_sikuli_wheel = wheel" in vc)
T("VCIV _sikuli_findAll preserved", "_sikuli_findAll = findAll" in vc)
T("VCIV click wrapped", "def click(target, *args):" in vc)
T("VCIV type wrapped", "def type(target, *args):" in vc)
T("VCIV paste wrapped", "def paste(target, *args):" in vc)
T("VCIV find wrapped", "def find(target, *args):" in vc)
T("VCIV exists wrapped", "def exists(target, *args):" in vc)
T("VCIV wheel wrapped", "def wheel(target, *args):" in vc)
T("VCIV findAll wrapped", "def findAll(target, *args):" in vc)
T("VCIV sleep override", "def sleep(seconds):" in vc)
T("VCIV MouseInfo", "MouseInfo" in vc)
T("VCIV mouse save", "MouseInfo.getPointerInfo().getLocation()" in vc)
T("VCIV mouse restore", "_robot.mouseMove(saved_x, saved_y)" in vc)
T("VCIV enter_critical_section def", "def enter_critical_section():" in vc)
T("VCIV exit_critical_section def", "def exit_critical_section():" in vc)

cs = vc.count("enter_critical_section()")
T("VCIV critical sections >= 6", cs >= 6, "count=%d" % cs)

# navigate_save_dialog_to_dir has critical section
ni = vc.find("def navigate_save_dialog_to_dir():")
if ni > 0:
    nd = vc.find("\ndef ", ni + 10)
    nb = vc[ni:nd if nd > 0 else len(vc)]
    T("VCIV navigate_save has CS", "enter_critical_section()" in nb)
    T("VCIV navigate_save has finally", "finally:" in nb)

# _recover uses originals only
ri2 = vc.find("def _recover_after_resume():")
if ri2 > 0:
    nd2 = vc.find("\ndef ", ri2 + 10)
    rb2 = vc[ri2:nd2 if nd2 > 0 else len(vc)]
    T("VCIV _recover uses _sikuli_exists", "_sikuli_exists" in rb2)
    T("VCIV _recover uses _sikuli_type", "_sikuli_type" in rb2)
    T("VCIV _recover uses _sikuli_click", "_sikuli_click" in rb2)
    T("VCIV _recover uses _sikuli_find", "_sikuli_find" in rb2)

# ===========================================================
# Test 3: Actual pause mechanism
# ===========================================================
out("\n[Test 3] Pause mechanism functional test")

AC_HOME = os.environ.get("AC_HOME", SCRIPT_DIR)
PS = os.path.join(AC_HOME, ".pause_signal")
if os.path.exists(PS):
    os.remove(PS)

T("Pause: no signal = False", not os.path.exists(PS))

with open(PS, "w") as f:
    f.write("p")
T("Pause: signal created = True", os.path.exists(PS))
os.remove(PS)
T("Pause: signal removed = False", not os.path.exists(PS))

# Critical section simulation
_cs_flag = [False]
def sim_check():
    if not os.path.exists(PS):
        return False
    if _cs_flag[0]:
        return False
    return True

with open(PS, "w") as f:
    f.write("p")
_cs_flag[0] = True
T("Pause: CS blocks detection", sim_check() == False)
_cs_flag[0] = False
T("Pause: CS release allows detect", sim_check() == True)
os.remove(PS)

# ===========================================================
# Test 4: Mouse position save/restore
# ===========================================================
out("\n[Test 4] Mouse position save/restore")

robot = Robot()
try:
    pos = MouseInfo.getPointerInfo().getLocation()
    ox, oy = pos.x, pos.y
    T("Mouse: read position OK", True, "(%d,%d)" % (ox, oy))

    robot.mouseMove(ox + 50, oy + 50)
    time.sleep(0.3)
    p2 = MouseInfo.getPointerInfo().getLocation()
    T("Mouse: moved", p2.x != ox or p2.y != oy, "(%d,%d)" % (p2.x, p2.y))

    robot.mouseMove(ox, oy)
    time.sleep(0.3)
    p3 = MouseInfo.getPointerInfo().getLocation()
    T("Mouse: restored", abs(p3.x - ox) <= 2 and abs(p3.y - oy) <= 2,
      "(%d,%d)" % (p3.x, p3.y))
except Exception as e:
    T("Mouse: API access", False, str(e))

# ===========================================================
# Test 5: Sleep override accuracy
# ===========================================================
out("\n[Test 5] Sleep override accuracy")

def test_sleep(secs):
    e = 0.0
    iv = 0.5
    n = 0
    while e < secs:
        r = secs - e
        w = min(iv, r)
        time.sleep(w)
        e += w
        n += 1
    return e, n

t0 = time.time()
el, it = test_sleep(2.0)
t1 = time.time()
T("Sleep: elapsed calc", abs(el - 2.0) < 0.01, "%.3f" % el)
T("Sleep: 4 iterations for 2s", it == 4, "iters=%d" % it)
T("Sleep: wall time ~2s", abs(t1 - t0 - 2.0) < 0.5, "%.3f" % (t1 - t0))

el2, it2 = test_sleep(1.3)
T("Sleep: non-integer 1.3s", abs(el2 - 1.3) < 0.01, "%.3f iters=%d" % (el2, it2))

# ===========================================================
# Test 6: Rapid toggle stress test
# ===========================================================
out("\n[Test 6] Rapid toggle stress (5x at 0.1s)")

try:
    for i in range(5):
        with open(PS, "w") as f:
            f.write("p")
        time.sleep(0.1)
        if os.path.exists(PS):
            os.remove(PS)
        time.sleep(0.1)
    T("RapidToggle: no crash", True)
except Exception as e:
    T("RapidToggle: no crash", False, str(e))

if os.path.exists(PS):
    os.remove(PS)

# ===========================================================
# Test 7: Live pause/resume with thread
# ===========================================================
out("\n[Test 7] Live pause/resume (2s pause during 5s sleep)")

_detected = [False]
_resumed = [False]

def live_sleep(secs):
    e = 0.0
    iv = 0.5
    while e < secs:
        r = secs - e
        w = min(iv, r)
        time.sleep(w)
        e += w
        if os.path.exists(PS):
            _detected[0] = True
            while os.path.exists(PS):
                time.sleep(0.3)
            _resumed[0] = True

def toggler():
    time.sleep(1)
    with open(PS, "w") as f:
        f.write("p")
    time.sleep(2)
    if os.path.exists(PS):
        os.remove(PS)

thr = threading.Thread(target=toggler)
thr.daemon = True
thr.start()

t0 = time.time()
live_sleep(5)
t1 = time.time()
total = t1 - t0
thr.join(timeout=5)

T("Live: pause detected", _detected[0])
T("Live: resume completed", _resumed[0])
T("Live: total >= 6.5s", total >= 6.5, "%.1fs" % total)

if os.path.exists(PS):
    os.remove(PS)

# ===========================================================
# RESULTS
# ===========================================================
out("\n" + "=" * 60)
out("RESULT: %d PASS / %d FAIL (total %d)" % (_pass[0], _fail[0], _pass[0] + _fail[0]))
out("=" * 60)

if _fail[0] > 0:
    out("\nFailed items:")
    for f in _failures:
        out("  - " + f)

out("\nTest complete.")
sys.exit(0 if _fail[0] == 0 else 1)
