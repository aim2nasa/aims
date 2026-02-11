# -*- coding: utf-8 -*-
"""AutoClicker 설정 영구 저장 (Windows Registry)

레지스트리 키: HKCU\\Software\\AutoClicker
"""
import winreg

_KEY_PATH = r"Software\AutoClicker"

_CHOSUNGS_ALL = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ","기타"]


def load_settings() -> dict:
    """레지스트리에서 설정 로드. 키가 없으면 None 반환."""
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _KEY_PATH, 0, winreg.KEY_READ)
    except FileNotFoundError:
        return None

    result = {}
    try:
        # chosungs (쉼표 구분 문자열 → set)
        val, _ = winreg.QueryValueEx(key, "Chosungs")
        if val:
            result["chosungs"] = set(val.split(","))
        else:
            result["chosungs"] = set(_CHOSUNGS_ALL)

        # mode
        val, _ = winreg.QueryValueEx(key, "Mode")
        result["mode"] = val if val in ("normal", "start_from", "only", "resume", "scroll_test") else "normal"

        # target
        val, _ = winreg.QueryValueEx(key, "Target")
        result["target"] = val or ""

        # no_ocr
        val, _ = winreg.QueryValueEx(key, "NoOCR")
        result["no_ocr"] = bool(val)

        # save_dir
        val, _ = winreg.QueryValueEx(key, "SaveDir")
        result["save_dir"] = val or ""

        # window_x, window_y (마지막 창 위치)
        try:
            val, _ = winreg.QueryValueEx(key, "WindowX")
            result["window_x"] = val
        except FileNotFoundError:
            pass
        try:
            val, _ = winreg.QueryValueEx(key, "WindowY")
            result["window_y"] = val
        except FileNotFoundError:
            pass

        # monitor (0=자동, 1=모니터1, 2=모니터2)
        try:
            val, _ = winreg.QueryValueEx(key, "Monitor")
            result["monitor"] = val
        except FileNotFoundError:
            pass

    except FileNotFoundError:
        pass
    finally:
        winreg.CloseKey(key)

    return result if result else None


def save_settings(settings: dict, save_dir: str = "") -> None:
    """설정을 레지스트리에 저장."""
    key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, _KEY_PATH)
    try:
        # chosungs (set → 쉼표 구분 문자열)
        chosungs = settings.get("chosungs", set())
        winreg.SetValueEx(key, "Chosungs", 0, winreg.REG_SZ, ",".join(sorted(chosungs)))

        # mode
        winreg.SetValueEx(key, "Mode", 0, winreg.REG_SZ, settings.get("mode", "normal"))

        # target
        winreg.SetValueEx(key, "Target", 0, winreg.REG_SZ, settings.get("target", ""))

        # no_ocr
        winreg.SetValueEx(key, "NoOCR", 0, winreg.REG_DWORD, 1 if settings.get("no_ocr") else 0)

        # save_dir
        if save_dir:
            winreg.SetValueEx(key, "SaveDir", 0, winreg.REG_SZ, save_dir)

        # window_x, window_y
        if "window_x" in settings:
            winreg.SetValueEx(key, "WindowX", 0, winreg.REG_DWORD, settings["window_x"])
        if "window_y" in settings:
            winreg.SetValueEx(key, "WindowY", 0, winreg.REG_DWORD, settings["window_y"])

        # monitor
        winreg.SetValueEx(key, "Monitor", 0, winreg.REG_DWORD, settings.get("monitor", 0))
    finally:
        winreg.CloseKey(key)
