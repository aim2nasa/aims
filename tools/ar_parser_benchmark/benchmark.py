"""
AR 문서 파싱 벤치마크
4가지 방법 비교: OpenAI, pdfplumber, Camelot, Upstage OCR

사용법:
    python benchmark.py <pdf_path>
"""

import os
import sys
import json
import time

# Windows 콘솔 인코딩 설정
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# .env 파일 로드
from dotenv import load_dotenv
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
# 상위 aims 폴더의 .env도 로드
load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

# 결과 저장용
@dataclass
class BenchmarkResult:
    method: str
    success: bool
    elapsed_seconds: float
    total_contracts: int
    total_monthly_premium: Optional[int]
    contracts: List[Dict]
    raw_output: Any
    error: Optional[str] = None


def parse_with_openai(pdf_path: str) -> BenchmarkResult:
    """OpenAI API로 파싱"""
    start = time.time()
    try:
        from openai import OpenAI

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # PDF 업로드
        with open(pdf_path, 'rb') as f:
            uploaded = client.files.create(file=f, purpose="assistants")

        system_prompt = """You are a strict document parsing assistant.
Extract contract tables from the Annual Report PDF.

Rules:
1. Return JSON only (no markdown, no comments)
2. JSON Schema:
   {
     "총_월보험료": number,
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
     ]
   }
3. 총_월보험료: Read the value directly from PDF (do not calculate)
4. 보험료(원): Extract numbers only (remove commas)
"""

        response = client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Parse this Annual Report PDF into JSON."},
                        {"type": "file", "file": {"file_id": uploaded.id}}
                    ]
                }
            ]
        )

        output = response.choices[0].message.content.strip()
        # 마크다운 코드블록 제거
        if output.startswith("```"):
            output = output.split("\n", 1)[1]
        if output.endswith("```"):
            output = output.rsplit("```", 1)[0]
        output = output.strip()

        data = json.loads(output)
        contracts = data.get("보유계약 현황", [])

        return BenchmarkResult(
            method="OpenAI",
            success=True,
            elapsed_seconds=time.time() - start,
            total_contracts=len(contracts),
            total_monthly_premium=data.get("총_월보험료"),
            contracts=contracts,
            raw_output=data
        )

    except Exception as e:
        return BenchmarkResult(
            method="OpenAI",
            success=False,
            elapsed_seconds=time.time() - start,
            total_contracts=0,
            total_monthly_premium=None,
            contracts=[],
            raw_output=None,
            error=str(e)
        )


def parse_with_pdfplumber(pdf_path: str) -> BenchmarkResult:
    """pdfplumber로 파싱"""
    start = time.time()
    try:
        import pdfplumber

        contracts = []
        total_premium = None

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""

                # 총 월보험료 추출
                if "월 보험료는 총" in text or "월보험료는 총" in text:
                    import re
                    match = re.search(r'월\s*보험료는\s*총\s*([\d,]+)', text)
                    if match:
                        total_premium = int(match.group(1).replace(",", ""))

                # 표 추출
                tables = page.extract_tables()
                for table in tables:
                    if not table:
                        continue

                    # 헤더 찾기
                    header_idx = None
                    for i, row in enumerate(table):
                        if row and "증권번호" in str(row):
                            header_idx = i
                            break

                    if header_idx is None:
                        continue

                    headers = [str(h).strip() if h else "" for h in table[header_idx]]

                    # 데이터 행 파싱
                    for row in table[header_idx + 1:]:
                        if not row or not row[0]:
                            continue

                        # 순번이 숫자인지 확인
                        try:
                            seq = int(str(row[0]).strip())
                        except:
                            continue

                        contract = {}
                        for j, val in enumerate(row):
                            if j < len(headers) and headers[j]:
                                key = headers[j].replace("\n", "")
                                contract[key] = str(val).strip() if val else ""

                        # 필드 정규화
                        normalized = normalize_contract(contract)
                        if normalized:
                            contracts.append(normalized)

        return BenchmarkResult(
            method="pdfplumber",
            success=True,
            elapsed_seconds=time.time() - start,
            total_contracts=len(contracts),
            total_monthly_premium=total_premium,
            contracts=contracts,
            raw_output={"contracts": contracts, "total": total_premium}
        )

    except Exception as e:
        import traceback
        return BenchmarkResult(
            method="pdfplumber",
            success=False,
            elapsed_seconds=time.time() - start,
            total_contracts=0,
            total_monthly_premium=None,
            contracts=[],
            raw_output=None,
            error=f"{str(e)}\n{traceback.format_exc()}"
        )


def parse_with_camelot(pdf_path: str) -> BenchmarkResult:
    """Camelot으로 파싱"""
    start = time.time()
    try:
        import camelot

        # 모든 페이지에서 표 추출
        tables = camelot.read_pdf(pdf_path, pages='all', flavor='lattice')

        if len(tables) == 0:
            # lattice 실패 시 stream 모드 시도
            tables = camelot.read_pdf(pdf_path, pages='all', flavor='stream')

        contracts = []
        total_premium = None

        for table in tables:
            df = table.df

            # 헤더 찾기
            header_idx = None
            for i, row in df.iterrows():
                if "증권번호" in str(row.values):
                    header_idx = i
                    break

            if header_idx is None:
                continue

            headers = df.iloc[header_idx].tolist()

            # 데이터 행 파싱
            for i in range(header_idx + 1, len(df)):
                row = df.iloc[i].tolist()
                if not row[0]:
                    continue

                try:
                    seq = int(str(row[0]).strip())
                except:
                    continue

                contract = {}
                for j, val in enumerate(row):
                    if j < len(headers) and headers[j]:
                        key = str(headers[j]).replace("\n", "")
                        contract[key] = str(val).strip() if val else ""

                normalized = normalize_contract(contract)
                if normalized:
                    contracts.append(normalized)

        # 총 월보험료는 텍스트에서 추출 (pdfplumber 사용)
        try:
            import pdfplumber
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    import re
                    match = re.search(r'월\s*보험료는\s*총\s*([\d,]+)', text)
                    if match:
                        total_premium = int(match.group(1).replace(",", ""))
                        break
        except:
            pass

        return BenchmarkResult(
            method="Camelot",
            success=True,
            elapsed_seconds=time.time() - start,
            total_contracts=len(contracts),
            total_monthly_premium=total_premium,
            contracts=contracts,
            raw_output={"contracts": contracts, "total": total_premium}
        )

    except Exception as e:
        import traceback
        return BenchmarkResult(
            method="Camelot",
            success=False,
            elapsed_seconds=time.time() - start,
            total_contracts=0,
            total_monthly_premium=None,
            contracts=[],
            raw_output=None,
            error=f"{str(e)}\n{traceback.format_exc()}"
        )


def parse_with_upstage(pdf_path: str) -> BenchmarkResult:
    """Upstage Document AI로 파싱"""
    start = time.time()
    try:
        import requests

        api_key = os.getenv("UPSTAGE_API_KEY")
        if not api_key:
            raise ValueError("UPSTAGE_API_KEY 환경변수가 설정되지 않았습니다")

        # Document Parse API 호출
        url = "https://api.upstage.ai/v1/document-ai/document-parse"
        headers = {"Authorization": f"Bearer {api_key}"}

        with open(pdf_path, 'rb') as f:
            files = {"document": f}
            data = {"output_formats": "['text', 'html']"}
            response = requests.post(url, headers=headers, files=files, data=data)

        if response.status_code != 200:
            raise Exception(f"API 오류: {response.status_code} - {response.text}")

        result = response.json()

        # HTML에서 표 파싱
        html_content = result.get("content", {}).get("html", "")
        contracts = parse_html_table(html_content)

        # 총 월보험료 추출
        text_content = result.get("content", {}).get("text", "")
        total_premium = None
        import re
        match = re.search(r'월\s*보험료는\s*총\s*([\d,]+)', text_content)
        if match:
            total_premium = int(match.group(1).replace(",", ""))

        return BenchmarkResult(
            method="Upstage",
            success=True,
            elapsed_seconds=time.time() - start,
            total_contracts=len(contracts),
            total_monthly_premium=total_premium,
            contracts=contracts,
            raw_output=result
        )

    except Exception as e:
        import traceback
        return BenchmarkResult(
            method="Upstage",
            success=False,
            elapsed_seconds=time.time() - start,
            total_contracts=0,
            total_monthly_premium=None,
            contracts=[],
            raw_output=None,
            error=f"{str(e)}\n{traceback.format_exc()}"
        )


def parse_html_table(html: str) -> List[Dict]:
    """HTML에서 표 파싱"""
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, 'html.parser')
        tables = soup.find_all('table')

        contracts = []
        for table in tables:
            rows = table.find_all('tr')
            if not rows:
                continue

            # 헤더 찾기
            header_idx = None
            for i, row in enumerate(rows):
                if "증권번호" in row.get_text():
                    header_idx = i
                    break

            if header_idx is None:
                continue

            headers = [th.get_text().strip() for th in rows[header_idx].find_all(['th', 'td'])]

            # 데이터 행 파싱
            for row in rows[header_idx + 1:]:
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue

                try:
                    seq = int(cells[0].get_text().strip())
                except:
                    continue

                contract = {}
                for j, cell in enumerate(cells):
                    if j < len(headers) and headers[j]:
                        contract[headers[j]] = cell.get_text().strip()

                normalized = normalize_contract(contract)
                if normalized:
                    contracts.append(normalized)

        return contracts

    except Exception as e:
        return []


def normalize_contract(contract: Dict) -> Optional[Dict]:
    """계약 정보 정규화"""
    if not contract:
        return None

    # 필드 매핑 (다양한 헤더명 지원)
    field_map = {
        "순번": ["순번"],
        "증권번호": ["증권번호"],
        "보험상품": ["보험상품", "상품명"],
        "계약자": ["계약자"],
        "피보험자": ["피보험자"],
        "계약일": ["계약일"],
        "계약상태": ["계약상태", "상태"],
        "가입금액(만원)": ["가입금액(만원)", "가입금액", "가입금액\n(만원)"],
        "보험기간": ["보험기간", "보험\n기간"],
        "납입기간": ["납입기간", "납입\n기간"],
        "보험료(원)": ["보험료(원)", "보험료", "보험료 (원)"]
    }

    result = {}
    for std_key, variants in field_map.items():
        for variant in variants:
            if variant in contract:
                val = contract[variant]

                # 타입 변환
                if std_key == "순번":
                    try:
                        val = int(str(val).strip())
                    except:
                        val = 0
                elif std_key in ["가입금액(만원)", "보험료(원)"]:
                    try:
                        val = int(str(val).replace(",", "").replace(" ", "").strip())
                    except:
                        val = 0

                result[std_key] = val
                break

    # 최소 필수 필드 확인
    if "증권번호" not in result or not result.get("증권번호"):
        return None

    return result


def calculate_accuracy(result: BenchmarkResult, ground_truth: Dict) -> Dict:
    """정확도 계산"""
    accuracy = {
        "contract_count_match": result.total_contracts == ground_truth["contract_count"],
        "premium_match": result.total_monthly_premium == ground_truth["total_premium"],
        "contract_details": []
    }

    # 각 계약별 정확도
    gt_contracts = ground_truth.get("contracts", [])
    for i, gt in enumerate(gt_contracts):
        if i < len(result.contracts):
            parsed = result.contracts[i]
            match = {
                "순번": parsed.get("순번") == gt.get("순번"),
                "증권번호": parsed.get("증권번호") == gt.get("증권번호"),
                "보험료": parsed.get("보험료(원)") == gt.get("보험료(원)")
            }
            accuracy["contract_details"].append(match)

    return accuracy


def run_benchmark(pdf_path: str) -> Dict[str, BenchmarkResult]:
    """모든 방법으로 벤치마크 실행"""
    print(f"\n{'='*60}")
    print(f"AR 파싱 벤치마크")
    print(f"PDF: {pdf_path}")
    print(f"{'='*60}\n")

    results = {}

    # 1. OpenAI
    print("🔄 [1/4] OpenAI 파싱 중...")
    results["openai"] = parse_with_openai(pdf_path)
    print_result(results["openai"])

    # 2. pdfplumber
    print("\n🔄 [2/4] pdfplumber 파싱 중...")
    results["pdfplumber"] = parse_with_pdfplumber(pdf_path)
    print_result(results["pdfplumber"])

    # 3. Camelot
    print("\n🔄 [3/4] Camelot 파싱 중...")
    results["camelot"] = parse_with_camelot(pdf_path)
    print_result(results["camelot"])

    # 4. Upstage
    print("\n🔄 [4/4] Upstage 파싱 중...")
    results["upstage"] = parse_with_upstage(pdf_path)
    print_result(results["upstage"])

    return results


def print_result(result: BenchmarkResult):
    """결과 출력"""
    status = "✅ 성공" if result.success else "❌ 실패"
    print(f"  {status} | {result.method}")
    print(f"  소요시간: {result.elapsed_seconds:.2f}초")
    print(f"  계약 수: {result.total_contracts}건")
    print(f"  총 월보험료: {result.total_monthly_premium:,}원" if result.total_monthly_premium else "  총 월보험료: 추출 실패")

    if result.error:
        print(f"  에러: {result.error[:100]}...")


def print_comparison(results: Dict[str, BenchmarkResult]):
    """결과 비교표 출력"""
    print(f"\n{'='*60}")
    print("📊 결과 비교")
    print(f"{'='*60}\n")

    print(f"{'방법':<12} {'성공':<6} {'소요시간':<10} {'계약수':<8} {'총월보험료':<15}")
    print("-" * 60)

    for name, result in results.items():
        success = "✅" if result.success else "❌"
        elapsed = f"{result.elapsed_seconds:.2f}초"
        contracts = f"{result.total_contracts}건"
        premium = f"{result.total_monthly_premium:,}원" if result.total_monthly_premium else "N/A"
        print(f"{result.method:<12} {success:<6} {elapsed:<10} {contracts:<8} {premium:<15}")

    print()


def save_results(results: Dict[str, BenchmarkResult], pdf_path: str):
    """결과를 JSON으로 저장"""
    output_dir = os.path.dirname(os.path.abspath(__file__))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pdf_name = os.path.splitext(os.path.basename(pdf_path))[0]
    output_path = os.path.join(output_dir, f"result_{pdf_name}_{timestamp}.json")

    data = {
        "pdf_path": pdf_path,
        "timestamp": timestamp,
        "results": {k: asdict(v) for k, v in results.items()}
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)

    print(f"📁 결과 저장: {output_path}")
    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python benchmark.py <pdf_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"파일을 찾을 수 없습니다: {pdf_path}")
        sys.exit(1)

    results = run_benchmark(pdf_path)
    print_comparison(results)
    save_results(results, pdf_path)
