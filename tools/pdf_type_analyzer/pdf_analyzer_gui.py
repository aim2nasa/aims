import tkinter as tk
from tkinter import filedialog, messagebox
import pdfplumber
import os

# --- PDF 분석 로직 (이전 코드와 동일) ---
def classify_pdf_type(file_path, min_text_length_per_page=50, min_text_page_ratio=0.7):
    """
    주어진 PDF 파일이 텍스트 기반인지 이미지(스캔) 기반인지 분류합니다.
    """
    if not os.path.exists(file_path):
        return "파일 없음: 지정된 경로에 파일이 없습니다."

    try:
        with pdfplumber.open(file_path) as pdf:
            total_pages = len(pdf.pages)
            
            if total_pages == 0:
                return "빈 PDF 파일: 페이지가 포함되어 있지 않습니다.", "이 PDF 파일은 내용이 없습니다."

            text_dominant_pages_count = 0
            
            for page in pdf.pages:
                text = page.extract_text(x_tolerance=2, y_tolerance=2)
                
                if text and len(text.strip()) >= min_text_length_per_page:
                    text_dominant_pages_count += 1
            
            text_rich_page_ratio = text_dominant_pages_count / total_pages

            if text_rich_page_ratio >= min_text_page_ratio:
                return "텍스트 기반 PDF", "텍스트를 검색하고 복사할 수 있으며, 편집이 용이합니다."
            elif text_rich_page_ratio < 0.1 and text_dominant_pages_count == 0:
                return "이미지(스캔) 기반 PDF", "텍스트를 검색하거나 복사하기 어려울 수 있으며, OCR(광학 문자 인식) 처리가 필요할 수 있습니다."
            else:
                return "혼합 또는 모호한 PDF", "텍스트와 이미지가 함께 포함되어 있거나, 명확히 한 가지 유형으로 분류하기 어렵습니다."

    except pdfplumber.exceptions.PDFSyntaxError:
        return "손상된 PDF 또는 암호화됨", "파일을 열 수 없거나 내용이 손상되어 분석할 수 없습니다."
    except Exception as e:
        return "알 수 없는 오류 발생", f"파일 분석 중 예상치 못한 문제가 발생했습니다: {e}"

# --- GUI 애플리케이션 클래스 ---
class PdfAnalyzerApp:
    def __init__(self, master):
        self.master = master
        self.version = "0.1.0" # 현재 버전

        # 프로그램 제목 설정 (버전 포함)
        master.title(f"PDF 파일 유형 분석기 (버전: {self.version})")
        
        master.geometry("600x320") # 창 크기 조정 (가로 길이 늘림)
        master.resizable(True, False) # 가로 크기 조절 허용, 세로 크기 조절 비활성화

        # --- 위젯 생성 ---
        # 파일 경로 입력/표시 필드
        self.file_label = tk.Label(master, text="선택된 PDF 파일:", font=("맑은 고딕", 10, "bold"))
        self.file_label.pack(pady=(15, 2)) # 상단 여백 추가

        # 파일 경로 Entry를 Frame 안에 넣어 Scrollbar와 함께 사용
        self.entry_frame = tk.Frame(master)
        self.entry_frame.pack(pady=5, padx=20, fill=tk.X, expand=True) # 가로로 확장되도록 설정

        self.file_path_var = tk.StringVar()
        self.file_entry = tk.Entry(self.entry_frame, textvariable=self.file_path_var, state="readonly", font=("맑은 고딕", 9))
        self.file_entry.pack(side=tk.LEFT, fill=tk.X, expand=True) # Entry가 프레임 안에서 가로로 확장

        # 가로 스크롤바 추가
        self.scrollbar = tk.Scrollbar(self.entry_frame, orient="horizontal", command=self.file_entry.xview)
        self.scrollbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.file_entry.config(xscrollcommand=self.scrollbar.set) # Entry에 스크롤바 연결

        # 파일 선택 버튼
        self.browse_button = tk.Button(master, text="PDF 파일 선택", command=self.browse_file, font=("맑은 고딕", 10))
        self.browse_button.pack(pady=5)

        # 분석 버튼
        self.analyze_button = tk.Button(master, text="PDF 분석 시작", command=self.analyze_pdf, font=("맑은 고딕", 12, "bold"), fg="blue")
        self.analyze_button.pack(pady=10)

        # 결과 표시 영역 (메인 결과와 보조 설명 분리)
        self.result_main_label = tk.Label(master, text="분석 결과:", font=("맑은 고딕", 11, "bold"))
        self.result_main_label.pack(pady=(5, 0))

        self.result_detail_label = tk.Label(master, text="파일을 선택하고 분석해주세요.", font=("맑은 고딕", 10), wraplength=550) # wraplength 늘림
        self.result_detail_label.pack(pady=(0, 10))

    def browse_file(self):
        """파일 탐색기 창을 열어 PDF 파일을 선택하게 합니다."""
        file_path = filedialog.askopenfilename(
            title="PDF 파일 선택",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")]
        )
        if file_path:
            self.file_path_var.set(file_path) # 선택된 파일 경로 표시
            self.result_main_label.config(text="분석 결과:") # 결과 초기화
            self.result_detail_label.config(text="'PDF 분석 시작' 버튼을 눌러주세요.")

    def analyze_pdf(self):
        """선택된 PDF 파일을 분석하고 결과를 표시합니다."""
        selected_file = self.file_path_var.get()
        if not selected_file:
            messagebox.showwarning("파일 선택 오류", "먼저 분석할 PDF 파일을 선택해주세요.")
            return

        # 분석 시작 전 UI 업데이트
        self.analyze_button.config(state="disabled", text="분석 중...")
        self.result_main_label.config(text="분석 결과: 분석 중...")
        self.result_detail_label.config(text="잠시만 기다려주세요.")
        self.master.update_idletasks() # UI 강제 업데이트

        # PDF 분석 로직 호출 (이제 두 개의 값을 반환)
        main_result, detail_result = classify_pdf_type(selected_file)
        
        # 분석 결과 표시
        self.result_main_label.config(text=f"분석 결과: {main_result}")
        self.result_detail_label.config(text=detail_result)
        self.analyze_button.config(state="normal", text="PDF 분석 시작")

# --- 애플리케이션 실행 ---
if __name__ == "__main__":
    root = tk.Tk()
    app = PdfAnalyzerApp(root)
    root.mainloop()