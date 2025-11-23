#!/usr/bin/env python3
"""
엑셀 파일 키워드 검색 도구 (GUI)
"""

import tkinter as tk
from tkinter import filedialog, scrolledtext, messagebox
import pandas as pd
from pathlib import Path
import threading
from datetime import datetime

# 버전 정보 (자동 날짜 기반)
VERSION = f"v0.1.{datetime.now().strftime('%Y%m%d')}"


class ExcelSearchApp:
    def __init__(self, root):
        self.root = root
        self.root.title(f"📊 엑셀 키워드 검색 - {VERSION}")
        self.root.geometry("900x700")

        # 파일 경로 저장
        self.file_path = None

        # UI 구성
        self.create_widgets()

    def create_widgets(self):
        # 상단 프레임: 파일 선택
        top_frame = tk.Frame(self.root, padx=10, pady=10)
        top_frame.pack(fill=tk.X)

        tk.Label(top_frame, text="엑셀 파일:", font=("Arial", 10)).pack(side=tk.LEFT)

        self.file_label = tk.Label(
            top_frame,
            text="파일을 선택하세요",
            fg="gray",
            font=("Arial", 9)
        )
        self.file_label.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)

        browse_btn = tk.Button(
            top_frame,
            text="📂 파일 선택",
            command=self.browse_file,
            font=("Arial", 10),
            bg="#4CAF50",
            fg="white",
            padx=10
        )
        browse_btn.pack(side=tk.RIGHT)

        # 중간 프레임: 키워드 입력
        middle_frame = tk.Frame(self.root, padx=10, pady=5)
        middle_frame.pack(fill=tk.X)

        tk.Label(middle_frame, text="검색어:", font=("Arial", 10)).pack(side=tk.LEFT)

        self.keyword_entry = tk.Entry(middle_frame, font=("Arial", 10))
        self.keyword_entry.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)
        self.keyword_entry.bind('<Return>', lambda e: self.search())

        search_btn = tk.Button(
            middle_frame,
            text="🔍 검색",
            command=self.search,
            font=("Arial", 10),
            bg="#2196F3",
            fg="white",
            padx=20
        )
        search_btn.pack(side=tk.RIGHT, padx=5)

        # 결과 지우기 버튼
        clear_btn = tk.Button(
            middle_frame,
            text="🗑️ 결과 지우기",
            command=self.clear_results,
            font=("Arial", 10),
            bg="#9E9E9E",
            fg="white",
            padx=15
        )
        clear_btn.pack(side=tk.RIGHT, padx=5)

        # 고객명 추출 버튼
        extract_names_btn = tk.Button(
            middle_frame,
            text="👥 고객명 추출",
            command=self.extract_customer_names,
            font=("Arial", 10),
            bg="#4CAF50",
            fg="white",
            padx=15
        )
        extract_names_btn.pack(side=tk.RIGHT)

        # 결과 프레임
        result_frame = tk.Frame(self.root, padx=10, pady=5)
        result_frame.pack(fill=tk.BOTH, expand=True)

        tk.Label(result_frame, text="검색 결과:", font=("Arial", 10, "bold")).pack(anchor=tk.W)

        # 스크롤 가능한 텍스트 영역
        self.result_text = scrolledtext.ScrolledText(
            result_frame,
            font=("Consolas", 9),
            wrap=tk.WORD,
            height=30
        )
        self.result_text.pack(fill=tk.BOTH, expand=True, pady=5)

        # 하단 프레임 (상태바 + 버전)
        bottom_frame = tk.Frame(self.root)
        bottom_frame.pack(fill=tk.X, side=tk.BOTTOM)

        # 상태바 (왼쪽)
        self.status_label = tk.Label(
            bottom_frame,
            text="파일을 선택하고 검색어를 입력하세요",
            font=("Arial", 9),
            fg="gray",
            anchor=tk.W,
            padx=10,
            pady=5
        )
        self.status_label.pack(fill=tk.X, side=tk.LEFT, expand=True)

        # 버전 라벨 (오른쪽)
        version_label = tk.Label(
            bottom_frame,
            text=VERSION,
            font=("Arial", 8),
            fg="#999999",
            anchor=tk.E,
            padx=10,
            pady=5
        )
        version_label.pack(side=tk.RIGHT)

    def browse_file(self):
        """파일 선택 다이얼로그"""
        file_path = filedialog.askopenfilename(
            title="엑셀 파일 선택",
            filetypes=[
                ("Excel files", "*.xlsx *.xls"),
                ("All files", "*.*")
            ]
        )

        if file_path:
            self.file_path = file_path
            # 파일명만 표시 (경로가 너무 길면)
            display_name = Path(file_path).name
            self.file_label.config(text=display_name, fg="black")
            self.status_label.config(text=f"✅ 파일 선택됨: {display_name}")

    def search(self):
        """검색 실행"""
        if not self.file_path:
            messagebox.showwarning("경고", "엑셀 파일을 먼저 선택하세요")
            return

        keyword = self.keyword_entry.get().strip()
        if not keyword:
            messagebox.showwarning("경고", "검색어를 입력하세요")
            return

        # 결과 영역 초기화
        self.result_text.delete(1.0, tk.END)
        self.status_label.config(text=f"🔍 검색 중... (키워드: '{keyword}')")

        # 별도 스레드에서 검색 (UI 블로킹 방지)
        search_thread = threading.Thread(
            target=self.perform_search,
            args=(self.file_path, keyword)
        )
        search_thread.daemon = True
        search_thread.start()

    def perform_search(self, file_path, keyword):
        """실제 검색 수행"""
        try:
            # 헤더 출력
            self.append_result(f"{'=' * 80}\n")
            self.append_result(f"📂 파일: {Path(file_path).name}\n")
            self.append_result(f"🔍 검색어: '{keyword}'\n")
            self.append_result(f"{'=' * 80}\n\n")

            # 엑셀 파일 읽기
            excel_file = pd.ExcelFile(file_path)
            total_matches = 0

            # 각 시트별로 검색
            for sheet_name in excel_file.sheet_names:
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)

                    if df.empty:
                        continue

                    # 키워드가 포함된 행 찾기
                    mask = df.astype(str).apply(
                        lambda row: row.str.contains(keyword, case=False, na=False).any(),
                        axis=1
                    )

                    matched_rows = df[mask]

                    if len(matched_rows) > 0:
                        self.append_result(f"📄 [{sheet_name}] - {len(matched_rows)}건 발견\n")
                        self.append_result(f"{'-' * 80}\n\n")

                        for idx, (row_num, row_data) in enumerate(matched_rows.iterrows(), 1):
                            total_matches += 1
                            excel_row_num = row_num + 2

                            self.append_result(f"  [{idx}] 행 {excel_row_num}:\n")

                            # 각 컬럼 데이터 출력
                            for col_name, cell_value in row_data.items():
                                if pd.notna(cell_value):
                                    # 키워드 포함 여부 체크
                                    has_keyword = keyword.lower() in str(cell_value).lower()
                                    marker = " ⭐" if has_keyword else ""
                                    self.append_result(f"      {col_name}: {cell_value}{marker}\n")

                            self.append_result("\n")

                except Exception as e:
                    self.append_result(f"\n⚠️  [{sheet_name}] 시트 읽기 실패: {e}\n\n")
                    continue

            # 결과 요약
            self.append_result(f"\n{'=' * 80}\n")
            self.append_result(f"✅ 검색 완료: 총 {total_matches}건 발견\n")

            self.status_label.config(text=f"✅ 검색 완료: {total_matches}건 발견")

        except Exception as e:
            self.append_result(f"\n❌ 오류 발생: {e}\n")
            self.status_label.config(text=f"❌ 오류: {e}")

    def append_result(self, text):
        """결과 텍스트 추가 (스레드 안전)"""
        self.result_text.insert(tk.END, text)
        self.result_text.see(tk.END)  # 자동 스크롤
        self.result_text.update()

    def clear_results(self):
        """검색 결과 지우기"""
        self.result_text.delete(1.0, tk.END)
        self.status_label.config(text="🗑️ 검색 결과가 지워졌습니다")

    def extract_customer_names(self):
        """고객명만 중복 없이 추출"""
        if not self.file_path:
            messagebox.showwarning("경고", "엑셀 파일을 먼저 선택하세요")
            return

        # 결과 영역 초기화
        self.result_text.delete(1.0, tk.END)
        self.status_label.config(text="👥 고객명 추출 중...")

        # 별도 스레드에서 추출 (UI 블로킹 방지)
        extract_thread = threading.Thread(
            target=self.perform_extract_names,
            args=(self.file_path,)
        )
        extract_thread.daemon = True
        extract_thread.start()

    def perform_extract_names(self, file_path):
        """실제 고객명 추출 수행"""
        try:
            # 헤더 출력
            self.append_result(f"{'=' * 80}\n")
            self.append_result(f"📂 파일: {Path(file_path).name}\n")
            self.append_result(f"👥 고객명 추출 (중복 제거)\n")
            self.append_result(f"{'=' * 80}\n\n")

            # 엑셀 파일 읽기
            excel_file = pd.ExcelFile(file_path)
            customer_names = set()  # 중복 제거를 위한 set

            # 고객명 컬럼 후보들
            name_columns = ['고객명', '이름', '성명', '계약자', '피보험자', '고객', 'name', 'customer_name']

            # 각 시트별로 고객명 추출
            for sheet_name in excel_file.sheet_names:
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)

                    if df.empty:
                        continue

                    # 고객명 컬럼 찾기
                    found_column = None
                    for col in df.columns:
                        if any(name_col.lower() in str(col).lower() for name_col in name_columns):
                            found_column = col
                            break

                    if found_column:
                        # 고객명 추출 (NaN 제외)
                        names = df[found_column].dropna().astype(str).str.strip()
                        # 빈 문자열 제외
                        names = names[names != '']
                        customer_names.update(names)
                        self.append_result(f"📄 [{sheet_name}] - '{found_column}' 컬럼에서 추출\n")
                    else:
                        self.append_result(f"⚠️  [{sheet_name}] - 고객명 컬럼을 찾을 수 없음\n")

                except Exception as e:
                    self.append_result(f"\n⚠️  [{sheet_name}] 시트 읽기 실패: {e}\n")
                    continue

            # 결과 정렬 및 출력
            self.append_result(f"\n{'=' * 80}\n")
            self.append_result(f"✅ 총 {len(customer_names)}명의 고객 발견 (중복 제거됨)\n")
            self.append_result(f"{'=' * 80}\n\n")

            if customer_names:
                sorted_names = sorted(customer_names)
                for idx, name in enumerate(sorted_names, 1):
                    self.append_result(f"{idx:4d}. {name}\n")
            else:
                self.append_result("고객명을 찾을 수 없습니다.\n")

            self.status_label.config(text=f"✅ 추출 완료: {len(customer_names)}명")

        except Exception as e:
            self.append_result(f"\n❌ 오류 발생: {e}\n")
            self.status_label.config(text=f"❌ 오류: {e}")


def main():
    root = tk.Tk()
    app = ExcelSearchApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
