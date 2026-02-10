# PaddleOCR-VL 테스트 결과 (2026-02-10)

## 결론: RTX 4060 8GB에서 실용 불가 - 프로젝트 폐기

PaddleOCR-VL 0.9B 모델은 wondercastle (RTX 4060 8GB)에서 동작은 하지만,
이미지 1장당 107~125초 소요되어 실용적이지 않다. Upstage API (3~10초) 유지.

---

## 테스트 환경

| 항목 | 사양 |
|------|------|
| GPU | NVIDIA GeForce RTX 4060 (8GB VRAM) |
| OS | Windows 11 + WSL2 |
| CUDA | 12.6 / Driver 560.94 |
| Docker | Desktop v4.60.0 (GPU passthrough) |
| PaddlePaddle | GPU 3.2.0 (cu126) |
| PaddleOCR | 3.4.0 (paddleocr[doc-parser]) |
| 모델 | PaddleOCR-VL-1.5-0.9B + PP-DocLayoutV3 |
| 테스트 이미지 | Metlife 고객 목록 스크린샷 (960x300px, 195KB, 15행 테이블) |

## 테스트 결과

| 테스트 | 시간 | 결과 |
|--------|------|------|
| 1차 (JIT 컴파일 포함) | 125.0초 | 200 OK |
| 2차 (JIT 캐시) | 114.1초 | 200 OK |
| 3차 (FlashAttention ON) | 115.6초 | 200 OK |
| 4차 (CUDA_LAUNCH_BLOCKING 제거) | 113.4초 | 200 OK |
| 5차 (Layout Detection OFF) | 107.1초 | 200 OK |
| **Upstage API (비교 대상)** | **3~10초** | **200 OK** |

## OCR 정확도

정상 동작. Upstage 호환 형식으로 반환:
```json
{"content": {"html": "<table>...</table>", "text": "전체 텍스트..."}}
```
- 고객명, 생년월일, 나이, 성별, 이메일, 전화번호 모두 인식
- HTML 테이블 구조 정상 (15행 x 10열)
- 기존 `extract_customer_data()` 파싱 로직과 호환 가능

## 근본 원인: 왜 느린가

PaddleOCR-VL은 **autoregressive Vision-Language 모델**이다.
테이블을 HTML로 변환할 때 토큰을 **하나씩** 생성한다.

```
테이블 15행 x 10열 → HTML ~2000 토큰
RTX 4060 토큰 생성 속도: ~15-20 tokens/sec
2000 ÷ 15 ≈ 133초 (이론값 ≈ 실측값)
```

이건 모델 아키텍처의 한계이며, 소프트웨어 최적화로 해결 불가능하다.

## 시도한 최적화

| 최적화 | 효과 |
|--------|------|
| `use_queues=False` | predict() 무한 행(deadlock) 해결 → 동작하게 만듦 |
| FlashAttention 활성화 (`config.json`) | VRAM 절약은 되지만 속도 향상 미미 |
| `CUDA_LAUNCH_BLOCKING` 제거 | 효과 없음 |
| Layout Detection 스킵 | ~8초 단축 (125→107초) |
| ccache 설치 | JIT 컴파일 캐싱 (2차부터 효과) |

## 해결한 기술적 문제

1. **Windows pip 설치 불가**: `fused_rms_norm_ext` CUDA 커널이 Windows wheel에 없음 → Docker 전환
2. **predict() 무한 행**: GitHub Issue #17046 - 멀티스레드 파이프라인 데드락 → `use_queues=False`
3. **PaddleOCRVLBlock 객체 접근 에러**: dict가 아닌 객체 → `.label`, `.content` 속성 접근으로 수정
4. **FlashAttention 비활성화**: 모델 `config.json`의 `use_flash_attention: false` → `true`로 변경

## VRAM 사용량

```
모델 로딩 후 대기: 5301 MiB / 8188 MiB
추론 중:          7886 MiB / 8188 MiB (거의 꽉 참)
```

Windows 데스크탑 앱과 GPU 경쟁 → 전체 시스템 느려짐

## 최종 판단

RTX 4060 8GB에서 PaddleOCR-VL은 비실용적. Upstage API 유지.
VL 모델을 실용적으로 사용하려면 최소 RTX 3090 (24GB) 이상 필요.
