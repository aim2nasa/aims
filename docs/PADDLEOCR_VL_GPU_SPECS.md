# PaddleOCR-VL 구동 GPU 스펙

## 모델 개요

| 항목 | 내용 |
|------|------|
| 모델 | PaddleOCR-VL (0.9B VLM) |
| 파라미터 | 0.9B (bfloat16) |
| 모델 가중치 | ~1.8GB VRAM |
| 추론 시 필요 VRAM | ~3~4GB (KV cache + 오버헤드 포함) |
| 지원 언어 | 109개 (한글 포함) |
| 정확도 | OmniDocBench v1.5 기준 94.5% (GPT-4o급) |
| 주요 기능 | OCR, 테이블 인식, 수식 인식, 차트 인식, 문서 파싱 |

## GPU 요구사항

### 필수 조건

- **NVIDIA Ampere 아키텍처 이상** (RTX 3000번대~) : BF16 하드웨어 지원 필수
- **VRAM 8GB+** : 실사용 기준
- **CUDA 12.6+**
- AMD / Intel GPU : 미지원

### GPU별 호환성

| 등급 | GPU | VRAM | BF16 지원 | 가능 여부 |
|------|-----|------|-----------|-----------|
| 최소 | RTX 3060 | 12GB | O (Ampere) | 충분 |
| 가성비 | RTX 4060 | 8GB | O (Ada) | 충분 |
| 권장 | RTX 4070 | 12GB | O (Ada) | 쾌적 |
| 서버급 | A100 / H100 | 40~80GB | O | 오버킬 |
| 불가 | GTX 1060/1080 | 6~8GB | X (Pascal) | BF16 미지원 |
| 불가 | RTX 2060/2080 | 6~8GB | X (Turing) | BF16 미지원 |

### 가격대 참고 (2026년 기준)

| GPU | 신품 가격 | 비고 |
|-----|----------|------|
| RTX 3060 12GB | ~30만원 | 중고 20만원대, 가장 저렴한 선택 |
| RTX 4060 8GB | ~40만원 | 전력 효율 좋음 |
| RTX 4070 12GB | ~65만원 | 쾌적한 추론 |

## 설치 방법

```bash
# PaddlePaddle GPU 버전 (CUDA 12.6)
python -m pip install paddlepaddle-gpu==3.2.1 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/

# PaddleOCR + doc-parser
python -m pip install -U "paddleocr[doc-parser]"

# Windows: safetensors 특수 버전
python -m pip install https://xly-devops.cdn.bcebos.com/safetensors-nightly/safetensors-0.6.2.dev0-cp38-abi3-win_amd64.whl

# (선택) Flash Attention으로 추론 가속
pip install flash-attn --no-build-isolation
```

## 사용 예시

```python
from paddleocr import PaddleOCRVL

pipeline = PaddleOCRVL(pipeline_version="v1")
output = pipeline.predict("table_image.png")

for res in output:
    res.print()
    res.save_to_json(save_path="output")
    res.save_to_markdown(save_path="output")
```

### 테이블 인식 (transformers)

```python
from PIL import Image
import torch
from transformers import AutoModelForCausalLM, AutoProcessor

model_path = "PaddlePaddle/PaddleOCR-VL"
DEVICE = "cuda"

model = AutoModelForCausalLM.from_pretrained(
    model_path, trust_remote_code=True, torch_dtype=torch.bfloat16
).to(DEVICE).eval()
processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)

image = Image.open("table_image.png").convert("RGB")
messages = [
    {"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text", "text": "Table Recognition:"},
    ]}
]
inputs = processor.apply_chat_template(
    messages, tokenize=True, add_generation_prompt=True,
    return_dict=True, return_tensors="pt"
).to(DEVICE)

outputs = model.generate(**inputs, max_new_tokens=1024)
print(processor.batch_decode(outputs, skip_special_tokens=True)[0])
```

## GPU 없이 대안

GPU가 없는 환경에서는 `korean_PP-OCRv5_mobile_rec` 사용:

| 항목 | PaddleOCR-VL (GPU) | korean_PP-OCRv5 (CPU) |
|------|--------------------|-----------------------|
| 정확도 | 94.5% (SOTA) | 88% (행 단위) |
| GPU | 필수 | 불필요 |
| 모델 크기 | ~1.8GB | 14MB |
| 속도 | ~1초/이미지 (GPU) | ~2초/이미지 (CPU) |
| 비용 | 무료 | 무료 |

## 참조

- [PaddleOCR-VL (HuggingFace)](https://huggingface.co/PaddlePaddle/PaddleOCR-VL)
- [PaddleOCR-VL-1.5 (HuggingFace)](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5)
- [PaddleOCR 공식 사이트](https://www.paddleocr.ai/latest/)
- [온라인 데모](https://huggingface.co/spaces/PaddlePaddle/PaddleOCR-VL_Online_Demo)
