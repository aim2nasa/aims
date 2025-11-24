#!/usr/bin/env python3
"""
엑셀 정제 도구 (GUI)
- 엑셀 파일의 모든 시트를 읽어서 표 형식으로 표시
- 드래그앤드롭 지원
"""

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinterdnd2 import DND_FILES, TkinterDnD
import pandas as pd
from pathlib import Path
from datetime import datetime

# 버전 정보
VERSION = f"v0.1.{datetime.now().strftime('%Y%m%d')}"


class ExcelRefinerApp:
    def __init__(self, root):
        self.root = root
        self.root.title(f"📊 엑셀 정제 도구 - {VERSION}")
        self.root.geometry("1200x800")

        # 파일 경로 저장
        self.file_path = None
        self.dataframes = {}  # 시트명: DataFrame 저장
        self.treeviews = {}  # 시트명: Treeview 저장

        # 스타일 설정
        self.setup_styles()

        # UI 구성
        self.create_widgets()

        # 드래그앤드롭 설정
        self.setup_drag_drop()

    def setup_styles(self):
        """Treeview 스타일 설정 (엑셀 스타일)"""
        style = ttk.Style()

        # 테마 설정
        style.theme_use('clam')

        # Treeview 스타일
        style.configure(
            "Excel.Treeview",
            background="white",
            foreground="black",
            rowheight=25,
            fieldbackground="white",
            borderwidth=1,
            relief="solid"
        )

        # 헤더 스타일
        style.configure(
            "Excel.Treeview.Heading",
            background="#E0E0E0",
            foreground="black",
            borderwidth=1,
            relief="solid",
            font=("Arial", 9, "bold")
        )

        # 선택된 행 스타일
        style.map(
            "Excel.Treeview",
            background=[('selected', '#B3D9FF')],
            foreground=[('selected', 'black')]
        )

        # 줄무늬 효과
        style.configure("Excel.Treeview", rowheight=22)

        # 테두리 스타일
        style.layout("Excel.Treeview", [
            ('Excel.Treeview.treearea', {'sticky': 'nswe'})
        ])

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

        # 검증 버튼
        validate_btn = tk.Button(
            top_frame,
            text="✓ 증권번호 검증",
            command=self.validate_policy_numbers,
            font=("Arial", 10),
            bg="#FF9800",
            fg="white",
            padx=10
        )
        validate_btn.pack(side=tk.RIGHT, padx=5)

        # 메인 프레임: 탭으로 시트별 표시
        main_frame = tk.Frame(self.root, padx=10, pady=5)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 탭 노트북
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True)

        # 하단 프레임: 상태바
        bottom_frame = tk.Frame(self.root)
        bottom_frame.pack(fill=tk.X, side=tk.BOTTOM)

        # 상태바
        self.status_label = tk.Label(
            bottom_frame,
            text="파일을 선택하거나 드래그앤드롭하세요",
            font=("Arial", 9),
            fg="gray",
            anchor=tk.W,
            padx=10,
            pady=5
        )
        self.status_label.pack(fill=tk.X, side=tk.LEFT, expand=True)

        # 버전 라벨
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
            display_name = Path(file_path).name
            self.file_label.config(text=display_name, fg="black")
            self.status_label.config(text=f"✅ 파일 로딩 중: {display_name}")

            # 엑셀 파일 로드
            self.load_excel_file(file_path)

    def setup_drag_drop(self):
        """드래그앤드롭 설정"""
        # 전체 윈도우에 드롭 가능하도록 설정
        self.root.drop_target_register(DND_FILES)
        self.root.dnd_bind('<<Drop>>', self.on_drop)

    def on_drop(self, event):
        """드롭 이벤트 핸들러"""
        # 드롭된 파일 경로 추출 (중괄호 제거)
        file_path = event.data.strip('{}')

        # 엑셀 파일인지 확인
        if file_path.lower().endswith(('.xlsx', '.xls')):
            self.file_path = file_path
            display_name = Path(file_path).name
            self.file_label.config(text=display_name, fg="black")
            self.status_label.config(text=f"✅ 파일 로딩 중: {display_name}")

            # 엑셀 파일 로드
            self.load_excel_file(file_path)
        else:
            messagebox.showwarning("경고", "엑셀 파일(.xlsx, .xls)만 지원됩니다.")

    def validate_policy_numbers(self):
        """증권번호 중복 검증"""
        if not self.dataframes:
            messagebox.showwarning("경고", "먼저 엑셀 파일을 로드하세요")
            return

        total_duplicates = 0
        duplicate_info = []

        # 각 시트별로 검증
        for sheet_name, df in self.dataframes.items():
            # 증권번호 칼럼 찾기
            policy_col = None
            for col in df.columns:
                if '증권' in col or '증권번호' in col:
                    policy_col = col
                    break

            if not policy_col:
                continue

            # 중복된 증권번호 찾기
            duplicated_mask = df[policy_col].duplicated(keep=False)
            duplicated_indices = df[duplicated_mask].index.tolist()

            if duplicated_indices:
                # 중복된 증권번호 값들
                duplicate_values = df.loc[duplicated_indices, policy_col].unique()
                duplicate_count = len(duplicated_indices)
                total_duplicates += duplicate_count

                duplicate_info.append(f"[{sheet_name}] {duplicate_count}건")

                # Treeview에서 중복 행들을 맨 위로 재배치
                tree = self.treeviews.get(sheet_name)
                if tree:
                    # 기존 모든 아이템 삭제
                    for item in tree.get_children():
                        tree.delete(item)

                    # DataFrame 칼럼 정보
                    columns = list(df.columns)

                    # 1. 중복된 행들을 먼저 삽입 (맨 위)
                    for idx in duplicated_indices:
                        row = df.iloc[idx]
                        values = [self.format_cell_value(col, row[col]) for col in columns]
                        tree.insert("", tk.END, text=str(idx + 1), values=values, tags=('duplicate',))

                    # 2. 정상 행들을 그 다음에 삽입
                    for idx in df.index:
                        if idx not in duplicated_indices:
                            row = df.iloc[idx]
                            values = [self.format_cell_value(col, row[col]) for col in columns]
                            tag = 'evenrow' if idx % 2 == 0 else 'oddrow'
                            tree.insert("", tk.END, text=str(idx + 1), values=values, tags=(tag,))

        # 결과 표시
        if total_duplicates > 0:
            info_msg = "\n".join(duplicate_info)
            messagebox.showwarning(
                "중복 발견",
                f"증권번호 중복이 발견되었습니다!\n\n{info_msg}\n\n중복된 행은 빨간색으로 표시되며,\n맨 위로 이동되었습니다."
            )
            self.status_label.config(text=f"⚠️ 증권번호 중복 {total_duplicates}건 발견")
        else:
            messagebox.showinfo("검증 완료", "증권번호 중복이 없습니다. ✓")
            self.status_label.config(text="✅ 증권번호 검증 완료 (중복 없음)")

    def load_excel_file(self, file_path):
        """엑셀 파일 로드 및 표시"""
        try:
            # 기존 탭 모두 제거
            for tab in self.notebook.tabs():
                self.notebook.forget(tab)

            self.dataframes.clear()
            self.treeviews.clear()

            # 엑셀 파일 읽기
            excel_file = pd.ExcelFile(file_path)
            total_rows = 0

            # 각 시트별로 탭 생성
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                self.dataframes[sheet_name] = df

                # 시트용 탭 생성
                self.create_sheet_tab(sheet_name, df)
                total_rows += len(df)

            self.status_label.config(
                text=f"✅ 로드 완료: {len(excel_file.sheet_names)}개 시트, 총 {total_rows:,}행"
            )

        except Exception as e:
            messagebox.showerror("오류", f"파일 로드 실패:\n{e}")
            self.status_label.config(text=f"❌ 오류: {e}")

    def format_cell_value(self, col_name, value):
        """셀 값을 칼럼명에 따라 포맷팅"""
        if pd.isna(value):
            return ""

        # 날짜 칼럼 (계약일, 생년월일 등)
        if '일' in col_name and isinstance(value, (pd.Timestamp, datetime)):
            return value.strftime('%Y-%m-%d')

        # 보험료, 금액 칼럼 (천단위 쉼표)
        if '료' in col_name or '금액' in col_name or '원' in col_name:
            try:
                num = float(value)
                return f"{int(num):,}"
            except:
                return str(value)

        # 증권번호 (숫자지만 쉼표 없이)
        if '증권' in col_name or '번호' in col_name:
            try:
                return str(int(float(value)))
            except:
                return str(value)

        # 기타
        return str(value)

    def create_sheet_tab(self, sheet_name, df):
        """시트별 탭 생성"""
        # 탭용 프레임
        tab_frame = tk.Frame(self.notebook)
        self.notebook.add(tab_frame, text=f"📄 {sheet_name} ({len(df)}행)")

        # 상단: 시트 정보
        info_frame = tk.Frame(tab_frame, padx=5, pady=5)
        info_frame.pack(fill=tk.X)

        info_text = f"행: {len(df):,} | 열: {len(df.columns)}"
        tk.Label(
            info_frame,
            text=info_text,
            font=("Arial", 9),
            fg="#666666"
        ).pack(side=tk.LEFT)

        # Treeview용 프레임 (스크롤바 포함)
        tree_frame = tk.Frame(tab_frame)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 수평 스크롤바
        h_scroll = ttk.Scrollbar(tree_frame, orient=tk.HORIZONTAL)
        h_scroll.pack(side=tk.BOTTOM, fill=tk.X)

        # 수직 스크롤바
        v_scroll = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL)
        v_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        # Treeview 생성 (엑셀 스타일 적용)
        columns = list(df.columns)
        tree = ttk.Treeview(
            tree_frame,
            columns=columns,
            show='tree headings',  # tree 칼럼 표시 (행 번호용)
            xscrollcommand=h_scroll.set,
            yscrollcommand=v_scroll.set,
            style="Excel.Treeview"
        )

        h_scroll.config(command=tree.xview)
        v_scroll.config(command=tree.yview)

        # 정렬 상태
        sort_state = {'col': None, 'asc': True}

        def sort_tree(col):
            """칼럼 정렬 (행 번호 포함)"""
            # 정렬 방향 결정
            if sort_state['col'] == col:
                sort_state['asc'] = not sort_state['asc']
            else:
                sort_state['col'] = col
                sort_state['asc'] = True

            asc = sort_state['asc']

            # 데이터 삭제
            for item in tree.get_children():
                tree.delete(item)

            # 정렬
            if col == '#':
                # 행 번호 정렬 (인덱스 기준)
                indices = list(df.index)
                if not asc:
                    indices.reverse()

                for i, idx in enumerate(indices):
                    row = df.iloc[idx]
                    vals = [self.format_cell_value(c, row[c]) for c in columns]
                    tag = 'evenrow' if i % 2 == 0 else 'oddrow'
                    tree.insert("", tk.END, text=str(idx + 1), values=vals, tags=(tag,))
            else:
                # 칼럼 정렬
                sorted_df = df.sort_values(by=col, ascending=asc)
                for i, (idx, row) in enumerate(sorted_df.iterrows()):
                    vals = [self.format_cell_value(c, row[c]) for c in columns]
                    tag = 'evenrow' if i % 2 == 0 else 'oddrow'
                    tree.insert("", tk.END, text=str(idx + 1), values=vals, tags=(tag,))

            # 헤더 업데이트
            symbol = ' ▲' if asc else ' ▼'
            if col == '#':
                tree.heading('#0', text='#' + symbol, command=lambda: sort_tree('#'))
                for c in columns:
                    tree.heading(c, text=c, command=lambda cx=c: sort_tree(cx))
            else:
                tree.heading('#0', text='#', command=lambda: sort_tree('#'))
                for c in columns:
                    if c == col:
                        tree.heading(c, text=c + symbol, command=lambda cx=c: sort_tree(cx))
                    else:
                        tree.heading(c, text=c, command=lambda cx=c: sort_tree(cx))

        # 행 번호 칼럼 설정 (#0)
        tree.heading('#0', text='#', command=lambda: sort_tree('#'))
        tree.column('#0', width=50, minwidth=50, stretch=False, anchor='center')

        # 칼럼 헤더 설정 및 너비 자동 조정
        for col in columns:
            tree.heading(col, text=col, command=lambda c=col: sort_tree(c))

            # 칼럼 데이터 최대 길이 계산
            max_len = len(str(col))  # 헤더 길이

            # 데이터 샘플링 (처음 100행만 체크 - 성능 고려)
            sample_data = df[col].head(100)
            for val in sample_data:
                if pd.notna(val):
                    formatted_val = self.format_cell_value(col, val)
                    max_len = max(max_len, len(str(formatted_val)))

            # 픽셀 너비 계산 (대략 1글자당 8px, 여백 20px)
            col_width = min(max(max_len * 8 + 20, 80), 400)

            # 칼럼별 정렬 설정
            if any(keyword in col for keyword in ['증권', '번호', '료', '금액', '원']):
                # 숫자 칼럼은 우측 정렬
                tree.column(col, width=col_width, minwidth=80, anchor='e')
            elif any(keyword in col for keyword in ['계약일', '이체일', '납입주기', '납입기간', '주수', '기간']):
                # 날짜, 기간 칼럼은 중앙 정렬
                tree.column(col, width=col_width, minwidth=80, anchor='center')
            else:
                # 기타는 왼쪽 정렬
                tree.column(col, width=col_width, minwidth=80)

        # 줄무늬 효과를 위한 태그 설정
        tree.tag_configure('oddrow', background='white')
        tree.tag_configure('evenrow', background='#F5F5F5')
        # 중복 행 표시 태그 (빨간색 배경)
        tree.tag_configure('duplicate', background='#FFE5E5', foreground='#D32F2F')

        # 데이터 삽입 (포맷팅 적용)
        for idx, row in df.iterrows():
            values = [self.format_cell_value(col, row[col]) for col in columns]
            # 홀수/짝수 행에 다른 배경색
            tag = 'evenrow' if idx % 2 == 0 else 'oddrow'
            # 행 번호는 1부터 시작 (text 파라미터에 행 번호)
            tree.insert("", tk.END, text=str(idx + 1), values=values, tags=(tag,))

        # Treeview 저장 (검증 기능에서 사용)
        self.treeviews[sheet_name] = tree

        tree.pack(fill=tk.BOTH, expand=True)


def main():
    root = TkinterDnD.Tk()
    app = ExcelRefinerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
