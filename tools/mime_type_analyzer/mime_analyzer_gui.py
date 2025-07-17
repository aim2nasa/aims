import sys, os
import tkinter as tk
from tkinter import filedialog, scrolledtext, messagebox
import csv

# src 경로 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
from src.docmeta.core import get_file_metadata

class MimeAnalyzerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("MIME 타입 분석기 (v0.2.0)")
        self.root.geometry("800x600")

        # 선택된 폴더 경로
        self.selected_folder = tk.StringVar()
        # 분석된 결과 저장 (리스트 형태)
        self.analysis_results = []

        # UI 구성
        tk.Label(root, text="선택된 폴더:").pack(anchor="w", padx=10, pady=5)
        self.folder_label = tk.Label(root, textvariable=self.selected_folder, fg="blue")
        self.folder_label.pack(anchor="w", padx=10)

        # 버튼 영역
        btn_frame = tk.Frame(root)
        btn_frame.pack(pady=5)

        tk.Button(btn_frame, text="폴더 선택", command=self.select_folder, width=12).pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="분석 시작", command=self.start_analysis, width=12).pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="로그 지우기", command=self.clear_log, width=12).pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="결과 저장", command=self.save_results, width=12).pack(side=tk.LEFT, padx=5)

        # 결과창 (스크롤 지원)
        self.result_box = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=25)
        self.result_box.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # 상태 표시
        self.status_label = tk.Label(root, text="분석 대기 중...", fg="gray")
        self.status_label.pack(anchor="w", padx=10, pady=5)

    def select_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.selected_folder.set(folder)

    def start_analysis(self):
        folder = self.selected_folder.get()
        if not folder:
            self.result_box.insert(tk.END, "⚠ 폴더가 선택되지 않았습니다.\n")
            return

        self.status_label.config(text="분석 중...")
        self.result_box.insert(tk.END, f"\n📂 선택된 폴더: {folder}\n\n")
        self.analysis_results = []  # 기존 결과 초기화

        # 전체 파일 수 먼저 계산
        all_files = []
        for root, _, files in os.walk(folder):
            for f in files:
                all_files.append(os.path.join(root, f))
        total_files = len(all_files)

        file_count = 0

        for file_path in all_files:
            meta = get_file_metadata(file_path)
            file_count += 1

            # 진행률 계산
            percent = (file_count / total_files) * 100 if total_files > 0 else 0

            # GUI 로그 출력 (번호+진행률 표시)
            self.result_box.insert(
                tk.END,
                f"[{file_count}/{total_files} | {percent:.1f}%] 파일: {file_path}\n"
            )
            self.result_box.insert(tk.END, f"  MIME: {meta['mime']}\n")
            self.result_box.insert(tk.END, f"  크기: {meta['size_bytes']} bytes\n")
            self.result_box.insert(tk.END, f"  상태: {meta['status']}\n\n")
            self.result_box.see(tk.END)
            self.root.update_idletasks()

            # 결과 저장 리스트 추가
            self.analysis_results.append({
                "filename": file_path,
                "mime": meta['mime'],
                "size": meta['size_bytes'],
                "status": meta['status']
            })

        # 분석 완료 요약
        self.result_box.insert(
            tk.END,
            f"✅ 분석 완료! 총 {file_count}개의 파일을 처리했습니다.\n"
        )
        self.status_label.config(text=f"✅ 분석 완료 ({file_count}개 파일)")

    def clear_log(self):
        """결과창 로그 지우기"""
        self.result_box.delete(1.0, tk.END)
        self.analysis_results = []
        self.status_label.config(text="로그가 초기화되었습니다.")

    def save_results(self):
        """
        분석 결과를 TXT(로그 스타일) 또는 CSV(표 포맷)로 저장
        """
        if not self.analysis_results:
            messagebox.showwarning("결과 없음", "저장할 분석 결과가 없습니다.")
            return

        filetypes = [("CSV file", "*.csv"), ("Text file", "*.txt")]
        save_path = filedialog.asksaveasfilename(
            title="결과 저장",
            defaultextension="",
            filetypes=filetypes
        )

        if not save_path:
            return

        # 확장자 자동 보정 (미입력 시 기본 TXT)
        if not save_path.lower().endswith(".csv") and not save_path.lower().endswith(".txt"):
            save_path += ".txt"

        try:
            # CSV → 쉼표 구분 표 형식 (Excel 호환)
            if save_path.lower().endswith(".csv"):
                with open(save_path, "w", newline="", encoding="utf-8-sig") as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(["번호", "파일명", "MIME", "크기(bytes)", "상태"])
                    for idx, r in enumerate(self.analysis_results, start=1):
                        writer.writerow([idx, r["filename"], r["mime"], r["size"], r["status"]])
                messagebox.showinfo("저장 완료", f"CSV 파일로 저장되었습니다.\n{save_path}")
            else:
                # TXT → 기존 로그 스타일
                with open(save_path, "w", encoding="utf-8") as txtfile:
                    for idx, r in enumerate(self.analysis_results, start=1):
                        txtfile.write(f"[{idx}] 파일: {r['filename']}\n")
                        txtfile.write(f"  MIME: {r['mime']}\n")
                        txtfile.write(f"  크기: {r['size']} bytes\n")
                        txtfile.write(f"  상태: {r['status']}\n\n")
                    txtfile.write(f"총 {len(self.analysis_results)}개의 파일 분석 완료.\n")
                messagebox.showinfo("저장 완료", f"TXT 파일로 저장되었습니다.\n{save_path}")

        except Exception as e:
            messagebox.showerror("저장 오류", f"저장 중 오류 발생:\n{e}")

def main():
    root = tk.Tk()
    app = MimeAnalyzerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()

