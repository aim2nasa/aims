import tkinter as tk
from tkinter import filedialog, scrolledtext, messagebox
import os
import threading
import queue
import csv

# file_analyzer.py 파일에서 get_mime_type_from_file 함수를 임포트합니다.
from file_analyzer import get_mime_type_from_file

# --- 버전 정보 추가 ---
__version__ = "0.1.1" # 현재 버전

class MimeTypeAnalyzerApp:
    def __init__(self, master):
        self.master = master
        master.title(f"MIME 타입 분석기 (v{__version__})")
        master.geometry("800x600")
        master.resizable(True, True)

        # 메뉴바 추가
        self.menubar = tk.Menu(master)
        master.config(menu=self.menubar)

        self.file_menu = tk.Menu(self.menubar, tearoff=0)
        self.menubar.add_cascade(label="파일", menu=self.file_menu)
        self.file_menu.add_command(label="결과 저장 (CSV)", command=self.save_results_csv, state=tk.DISABLED)
        self.file_menu.add_command(label="결과 저장 (TXT)", command=self.save_results_txt, state=tk.DISABLED)
        self.file_menu.add_separator()
        self.file_menu.add_command(label="종료", command=master.quit)

        # UI 요소 생성
        self.folder_path_label = tk.Label(master, text="선택된 폴더: 없음", wraplength=700, justify="left")
        self.folder_path_label.pack(pady=10, padx=10, fill=tk.X)

        self.select_folder_button = tk.Button(master, text="폴더 선택", command=self.select_folder)
        self.select_folder_button.pack(pady=5)

        self.analyze_button = tk.Button(master, text="분석 시작", command=self.start_analysis, state=tk.DISABLED)
        self.analyze_button.pack(pady=5)

        self.result_text = scrolledtext.ScrolledText(master, wrap=tk.WORD, width=90, height=25, font=("Consolas", 10))
        self.result_text.pack(pady=10, padx=10, fill=tk.BOTH, expand=True)

        self.status_label = tk.Label(master, text="준비됨", bd=1, relief=tk.SUNKEN, anchor=tk.W)
        self.status_label.pack(side=tk.BOTTOM, fill=tk.X)

        self.selected_folder = None
        self.analysis_queue = queue.Queue()
        self.raw_results = [] # CSV 저장을 위한 원본 데이터
        self.display_results = [] # TXT 저장을 위한 GUI 표시 형태 데이터 (추가)
        self.master.after(100, self.process_queue)

    def select_folder(self):
        folder_selected = filedialog.askdirectory()
        if folder_selected:
            self.selected_folder = folder_selected
            self.folder_path_label.config(text=f"선택된 폴더: {self.selected_folder}")
            self.analyze_button.config(state=tk.NORMAL)
            self.result_text.delete(1.0, tk.END)
            self.status_label.config(text=f"'{os.path.basename(self.selected_folder)}' 폴더가 선택되었습니다. 분석을 시작하세요.")
            self.file_menu.entryconfig("결과 저장 (CSV)", state=tk.DISABLED)
            self.file_menu.entryconfig("결과 저장 (TXT)", state=tk.DISABLED)
            self.raw_results = []
            self.display_results = [] # 초기화
        else:
            self.selected_folder = None
            self.folder_path_label.config(text="선택된 폴더: 없음")
            self.analyze_button.config(state=tk.DISABLED)
            self.status_label.config(text="폴더 선택 취소됨.")

    def start_analysis(self):
        if not self.selected_folder:
            messagebox.showwarning("경고", "먼저 분석할 폴더를 선택해주세요!")
            return

        self.result_text.delete(1.0, tk.END)
        self.analyze_button.config(state=tk.DISABLED)
        self.select_folder_button.config(state=tk.DISABLED)
        self.file_menu.entryconfig("결과 저장 (CSV)", state=tk.DISABLED)
        self.file_menu.entryconfig("결과 저장 (TXT)", state=tk.DISABLED)
        self.raw_results = []
        self.display_results = [] # 초기화
        self.status_label.config(text="분석 중... 잠시 기다려 주세요.")
        
        self.analysis_thread = threading.Thread(target=self._run_analysis_in_thread)
        self.analysis_thread.daemon = True
        self.analysis_thread.start()

    def _run_analysis_in_thread(self):
        total_files = 0
        analyzed_files = 0
        
        for dirpath, dirnames, filenames in os.walk(self.selected_folder):
            total_files += len(filenames)
        
        if total_files == 0:
            self.analysis_queue.put(("completed", "선택된 폴더에 파일이 없습니다."))
            return

        self.analysis_queue.put(("status", f"총 {total_files}개 파일 분석 시작..."))

        for dirpath, dirnames, filenames in os.walk(self.selected_folder):
            for filename in filenames:
                file_full_path = os.path.join(dirpath, filename)
                
                mime_type, error = get_mime_type_from_file(file_full_path)
                analyzed_files += 1
                
                self.raw_results.append({ # CSV 저장을 위해 원본 데이터 저장
                    "파일경로": file_full_path,
                    "MIME타입": mime_type if mime_type else "분석 실패",
                    "오류메시지": error if error else ""
                })

                # GUI 및 TXT 저장을 위한 표시용 문자열 생성
                if mime_type:
                    display_line = f"파일: '{file_full_path}' -> MIME 타입: {mime_type}"
                elif error:
                    display_line = f"파일: '{file_full_path}' -> 분석 실패: {error}"
                else:
                    display_line = f"파일: '{file_full_path}' -> MIME 타입을 알 수 없습니다."
                
                self.display_results.append(display_line) # 표시용 결과 저장 (추가)
                self.analysis_queue.put(("result", display_line)) # GUI 업데이트용으로 큐에 전달
                
                progress_percent = (analyzed_files / total_files) * 100
                self.analysis_queue.put(("status", f"분석 중... ({analyzed_files}/{total_files} - {progress_percent:.1f}%)"))
        
        self.analysis_queue.put(("completed", "분석 완료!"))

    def process_queue(self):
        try:
            while True:
                item_type, item_data = self.analysis_queue.get_nowait()
                if item_type == "completed":
                    self.analyze_button.config(state=tk.NORMAL)
                    self.select_folder_button.config(state=tk.NORMAL)
                    self.file_menu.entryconfig("결과 저장 (CSV)", state=tk.NORMAL)
                    self.file_menu.entryconfig("결과 저장 (TXT)", state=tk.NORMAL)
                    self.status_label.config(text=item_data)
                    break
                elif item_type == "result":
                    self.result_text.insert(tk.END, item_data + "\n")
                    self.result_text.see(tk.END)
                elif item_type == "status":
                    self.status_label.config(text=item_data)
        except queue.Empty:
            pass
        finally:
            self.master.after(100, self.process_queue)

    def save_results_csv(self):
        if not self.raw_results:
            messagebox.showwarning("경고", "저장할 분석 결과가 없습니다.")
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            title="CSV 파일로 결과 저장"
        )
        if file_path:
            try:
                with open(file_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
                    fieldnames = ["파일경로", "MIME타입", "오류메시지"]
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

                    writer.writeheader()
                    writer.writerows(self.raw_results)
                messagebox.showinfo("저장 완료", f"결과가 '{file_path}'에 CSV 형식으로 저장되었습니다.")
            except Exception as e:
                messagebox.showerror("저장 오류", f"CSV 파일 저장 중 오류 발생: {e}")

    def save_results_txt(self):
        # --- 이 함수를 수정합니다 ---
        if not self.display_results: # raw_results 대신 display_results 사용
            messagebox.showwarning("경고", "저장할 분석 결과가 없습니다.")
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
            title="텍스트 파일로 결과 저장"
        )
        if file_path:
            try:
                with open(file_path, 'w', encoding='utf-8') as txtfile:
                    for line in self.display_results: # display_results 리스트의 각 줄을 그대로 씁니다.
                        txtfile.write(line + "\n")
                messagebox.showinfo("저장 완료", f"결과가 '{file_path}'에 텍스트 형식으로 저장되었습니다.")
            except Exception as e:
                messagebox.showerror("저장 오류", f"텍스트 파일 저장 중 오류 발생: {e}")

# 애플리케이션 시작
if __name__ == "__main__":
    root = tk.Tk()
    app = MimeTypeAnalyzerApp(root)
    root.mainloop()