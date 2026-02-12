---
name: ac-capture
description: 화면 캡처. AC 캡처, AC GUI, 화면 캡처 요청 시 자동 사용
---

# 화면 캡처 (DXGI Desktop Duplication)

MetSquare 캡처 방지를 우회하는 DXGI 기반 캡처.

## 캡처 명령

```bash
python D:\aims\tools\capture\capture.py --monitor <1|2|all>
```

| 파라미터 | 설명 |
|----------|------|
| `--monitor 1` | 모니터1 |
| `--monitor 2` | 모니터2 |
| `--monitor all` | 전체 (모니터 횡 결합) |
| `--output <path>` | 경로 직접 지정 (미지정 시 자동 번호) |

자동 저장: `D:\tmp\capture_001.png`, `capture_002.png`, ...

## 단축키 (시작 메뉴 바로가기)

| 단축키 | 동작 |
|--------|------|
| Ctrl+Alt+1 | 모니터1 → `D:\tmp\capture_NNN.png` |
| Ctrl+Alt+2 | 모니터2 → `D:\tmp\capture_NNN.png` |

단축키 재생성: `powershell.exe -ExecutionPolicy Bypass -File "D:\aims\tools\capture\create_shortcuts.ps1"`

## AC 프리셋

모니터2 캡처 후 `X=1376, Y=430, W=490, H=460` 크롭.

## 캡처 후

Read 도구로 가장 최근 `D:\tmp\capture_*.png` 확인.
