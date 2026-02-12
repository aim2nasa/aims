# capture.py - DXGI Desktop Duplication API 기반 화면 캡처
# MetSquare 등 GDI 훅 기반 캡처 방지를 우회
# Usage: python capture.py [--monitor <1|2|all>] [--output <path>]

import argparse
import sys
import os
import glob
import io
import ctypes
import ctypes.wintypes

def next_path(base_dir, prefix):
    """capture_001.png, capture_002.png, ... 다음 번호 반환"""
    existing = glob.glob(os.path.join(base_dir, f"{prefix}_*.png"))
    if not existing:
        return os.path.join(base_dir, f"{prefix}_001.png")
    nums = []
    for f in existing:
        name = os.path.splitext(os.path.basename(f))[0]
        parts = name.rsplit("_", 1)
        if len(parts) == 2 and parts[1].isdigit():
            nums.append(int(parts[1]))
    nxt = max(nums) + 1 if nums else 1
    return os.path.join(base_dir, f"{prefix}_{nxt:03d}.png")

def get_monitor_map():
    """Windows DISPLAY 번호 → dxcam output_idx 매핑.
    DISPLAY1→모니터1, DISPLAY2→모니터2. dxcam은 Primary=output0."""
    import ctypes

    # DISPLAY별 좌표 가져오기 (DISPLAY1, DISPLAY2, ...)
    displays = {}  # {display_num: x_pos}
    i = 0
    while True:
        device = ctypes.create_unicode_buffer(32)
        dd = (ctypes.c_byte * 424)()
        ctypes.cast(dd, ctypes.POINTER(ctypes.c_ulong))[0] = 424
        if not ctypes.windll.user32.EnumDisplayDevicesW(None, i, dd, 0):
            break
        name = ctypes.wstring_at(ctypes.addressof(dd) + 4, 32).rstrip('\x00')
        # DISPLAY 번호 추출
        num = int(name.replace('\\\\.\\DISPLAY', ''))
        # DEVMODE로 좌표 가져오기
        dm = (ctypes.c_byte * 220)()
        ctypes.cast(dm, ctypes.POINTER(ctypes.c_ushort))[34] = 220
        if ctypes.windll.user32.EnumDisplaySettingsW(name, -1, dm):
            x = ctypes.cast(ctypes.addressof(dm) + 76, ctypes.POINTER(ctypes.c_int32))[0]
            displays[num] = x
        i += 1

    # dxcam: output0=Primary(x=0), output1=나머지
    # DISPLAY 번호 → dxcam idx 매핑
    dxcam_map = {}
    for display_num, x_pos in displays.items():
        dxcam_map[display_num] = 0 if x_pos == 0 else 1

    return dxcam_map

def capture_monitor(dxcam_idx, user_num, output_path):
    """지정한 모니터 캡처 (DXGI Desktop Duplication)"""
    import dxcam
    import cv2
    cam = dxcam.create(output_idx=dxcam_idx)
    frame = cam.grab()
    cam.release()
    if frame is not None:
        cv2.imwrite(output_path, cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
        h, w = frame.shape[:2]
        print(f"OK: Monitor{user_num} (dxcam={dxcam_idx}) {w}x{h} -> {output_path}")
        return True
    else:
        print(f"ERROR: Monitor{user_num} (dxcam={dxcam_idx}) grab failed")
        return False

def capture_all(output_path):
    """전체 화면(모든 모니터) 캡처"""
    import dxcam
    import cv2
    import numpy as np
    mon_map = get_monitor_map()
    frames = []
    max_h = 0
    total_w = 0
    for user_num in sorted(mon_map.keys()):
        dxcam_idx = mon_map[user_num]
        cam = dxcam.create(output_idx=dxcam_idx)
        frame = cam.grab()
        cam.release()
        if frame is not None:
            frames.append(cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
            h, w = frame.shape[:2]
            max_h = max(max_h, h)
            total_w += w
    if not frames:
        print("ERROR: no monitors captured")
        return False
    canvas = np.zeros((max_h, total_w, 3), dtype=np.uint8)
    x = 0
    for f in frames:
        h, w = f.shape[:2]
        canvas[:h, x:x+w] = f
        x += w
    cv2.imwrite(output_path, canvas)
    print(f"OK: All {len(frames)} monitors {total_w}x{max_h} -> {output_path}")
    return True

def copy_to_clipboard(image_path):
    """PNG 파일을 클립보드에 복사 (Windows DIB 형식)"""
    from PIL import Image
    img = Image.open(image_path)
    # BMP 형식으로 변환 (DIB 헤더 제거 = 14바이트 스킵)
    bmp_buf = io.BytesIO()
    img.save(bmp_buf, format="BMP")
    bmp_data = bmp_buf.getvalue()[14:]  # BITMAPFILEHEADER 제거

    CF_DIB = 8
    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32

    # 64비트 호환: 인자/반환 타입 명시
    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    user32.OpenClipboard.argtypes = [ctypes.c_void_p]
    user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]

    user32.OpenClipboard(None)
    user32.EmptyClipboard()
    hmem = kernel32.GlobalAlloc(0x0042, len(bmp_data))
    ptr = kernel32.GlobalLock(hmem)
    ctypes.memmove(ptr, bmp_data, len(bmp_data))
    kernel32.GlobalUnlock(hmem)
    user32.SetClipboardData(CF_DIB, hmem)
    user32.CloseClipboard()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--monitor", default="1", help="1=왼쪽모니터, 2=오른쪽모니터, all=전체")
    parser.add_argument("--output", default=None, help="저장 경로 (미지정 시 자동 번호)")
    parser.add_argument("--dir", default="D:/tmp", help="자동 번호 저장 디렉토리")
    args = parser.parse_args()

    save_dir = args.dir
    os.makedirs(save_dir, exist_ok=True)

    if args.output:
        output_path = args.output
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    else:
        prefix = f"capture_mon{args.monitor}" if args.monitor != "all" else "capture_all"
        output_path = next_path(save_dir, prefix)

    if args.monitor == "all":
        ok = capture_all(output_path)
    else:
        mon_map = get_monitor_map()
        user_num = int(args.monitor)
        if user_num not in mon_map:
            print(f"ERROR: Monitor {user_num} not found (available: {list(mon_map.keys())})")
            sys.exit(1)
        ok = capture_monitor(mon_map[user_num], user_num, output_path)

    if ok:
        try:
            copy_to_clipboard(output_path)
        except Exception as e:
            print(f"WARN: clipboard copy failed: {e}")

    sys.exit(0 if ok else 1)
