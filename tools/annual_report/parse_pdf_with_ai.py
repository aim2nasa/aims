from openai import OpenAI
import json
import sys
import os
import re

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def parse_pdf_with_ai(pdf_path):
    # 1. PDF 업로드
    file = client.files.create(
        file=open(pdf_path, "rb"),
        purpose="assistants"
    )

    # 2. Responses API 호출
    response = client.responses.create(
        model="gpt-4.1",
        input=[
            {
                "role": "system",
                "content": """
                You are a strict document parsing assistant.
                Extract '보유계약 현황' and '부활가능 실효계약' tables from the PDF.

                Rules:
                1. 반드시 JSON만 반환. (마크다운, 주석, 설명 절대 금지)
                2. JSON Schema:
                   {
                     "보유계약 현황": [
                       {
                         "순번": number,
                         "증권번호": string,
                         "보험상품": string,
                         "계약자": string,
                         "피보험자": string,
                         "계약일": "YYYY-MM-DD",
                         "계약상태": string,
                         "가입금액(만원)": number,
                         "보험기간": string,
                         "납입기간": string,
                         "보험료(원)": number
                       }
                     ],
                     "부활가능 실효계약": [ ... ]
                   }
                3. 보험상품:
                   - 반드시 PDF 표 셀 내부의 텍스트만 기록
                   - 표 외부 텍스트(머리말, 각주, 회사명, 마케팅 문구 등)는 절대 포함하지 말 것
                   - 상품명은 "보험", "종신", "연금", "플랜", "Plus" 등 보험 관련 키워드로 끝나야 함
                   - 줄바꿈으로 나뉜 경우 합쳐서 하나의 문자열로 작성
                   - 의미 없는 단어, 문구, 회사명은 절대 포함하지 않는다
                4. 계약자/피보험자:
                   - 반드시 사람 이름만 기록
                   - 불필요한 텍스트는 제거
                """
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "Parse the attached PDF into JSON tables."},
                    {"type": "input_file", "file_id": file.id}
                ]
            }
        ]
    )

    # 3. 출력 텍스트
    output_text = response.output[0].content[0].text.strip()

    # 4. 혹시 붙은 코드블록 제거
    output_text = re.sub(r"^```json\s*", "", output_text)
    output_text = re.sub(r"^```", "", output_text)
    output_text = re.sub(r"```$", "", output_text)

    try:
        parsed_json = json.loads(output_text)
        return parsed_json
    except Exception:
        return {"raw_output": output_text}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ 사용법: python parse_pdf_with_ai.py <PDF파일>")
        sys.exit(1)

    pdf_file = sys.argv[1]
    result = parse_pdf_with_ai(pdf_file)
    print(json.dumps(result, ensure_ascii=False, indent=2))

