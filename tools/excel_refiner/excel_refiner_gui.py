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

        # 정제된 파일 저장 버튼
        save_refined_btn = tk.Button(
            top_frame,
            text="💾 정제된 파일 저장",
            command=self.save_refined_file,
            font=("Arial", 10),
            bg="#2196F3",
            fg="white",
            padx=10
        )
        save_refined_btn.pack(side=tk.RIGHT, padx=5)

        # 선택 행 삭제 버튼
        delete_btn = tk.Button(
            top_frame,
            text="🗑 선택 행 삭제",
            command=self.delete_selected_rows,
            font=("Arial", 10),
            bg="#F44336",
            fg="white",
            padx=10
        )
        delete_btn.pack(side=tk.RIGHT, padx=5)

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
        """증권번호 중복 검증 (엄격 모드)"""
        if not self.dataframes:
            messagebox.showwarning("경고", "먼저 엑셀 파일을 로드하세요")
            return

        total_duplicates = 0
        duplicate_info = []
        empty_count = 0

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

            # 증권번호 정규화 (문자열 변환 + 공백 제거)
            normalized = df[policy_col].apply(lambda x: str(x).strip() if pd.notna(x) else '')

            # 빈 값 체크
            empty_mask = (normalized == '') | (normalized == 'nan')
            empty_indices = df[empty_mask].index.tolist()

            if len(empty_indices) > 0:
                empty_count += len(empty_indices)
                duplicate_info.append(f"[{sheet_name}] 빈 증권번호 {len(empty_indices)}건")

            # 정규화된 값으로 중복 체크
            duplicated_mask = normalized.duplicated(keep=False)
            duplicated_indices = df[duplicated_mask].index.tolist()

            # 빈 값은 중복 목록에서 제외 (별도 표시)
            duplicated_indices = [idx for idx in duplicated_indices if idx not in empty_indices]

            if duplicated_indices:
                duplicate_count = len(duplicated_indices)
                total_duplicates += duplicate_count
                duplicate_info.append(f"[{sheet_name}] 중복 {duplicate_count}건")

            # 문제가 있는 행이 있으면 Treeview 재배치
            if duplicated_indices or empty_indices:
                tree = self.treeviews.get(sheet_name)
                if tree:
                    # 기존 모든 아이템 삭제
                    for item in tree.get_children():
                        tree.delete(item)

                    # DataFrame 칼럼 정보
                    columns = list(df.columns)

                    # 1. 빈 증권번호 행들을 먼저 삽입 (노란색)
                    for idx in empty_indices:
                        row = df.iloc[idx]
                        values = [self.format_cell_value(col, row[col]) for col in columns]
                        # 엑셀 행 번호 = DataFrame 인덱스 + 2 (헤더가 1행)
                        tree.insert("", tk.END, text=str(idx + 2), values=values, tags=('empty',))

                    # 2. 중복된 행들을 그 다음에 삽입 (빨간색)
                    for idx in duplicated_indices:
                        row = df.iloc[idx]
                        values = [self.format_cell_value(col, row[col]) for col in columns]
                        # 엑셀 행 번호 = DataFrame 인덱스 + 2 (헤더가 1행)
                        tree.insert("", tk.END, text=str(idx + 2), values=values, tags=('duplicate',))

                    # 3. 정상 행들을 그 다음에 삽입
                    problem_indices = set(empty_indices + duplicated_indices)
                    for idx in df.index:
                        if idx not in problem_indices:
                            row = df.iloc[idx]
                            values = [self.format_cell_value(col, row[col]) for col in columns]
                            tag = 'evenrow' if idx % 2 == 0 else 'oddrow'
                            # 엑셀 행 번호 = DataFrame 인덱스 + 2 (헤더가 1행)
                            tree.insert("", tk.END, text=str(idx + 2), values=values, tags=(tag,))

        # 결과 표시
        if total_duplicates > 0 or empty_count > 0:
            info_msg = "\n".join(duplicate_info)
            msg_parts = []

            if total_duplicates > 0:
                msg_parts.append(f"❌ 중복된 증권번호: {total_duplicates}건")

            if empty_count > 0:
                msg_parts.append(f"⚠️ 빈 증권번호: {empty_count}건")

            msg_parts.append(f"\n{info_msg}")
            msg_parts.append("\n빈 증권번호: 노란색")
            msg_parts.append("중복 증권번호: 빨간색")
            msg_parts.append("\n문제가 있는 행들이 맨 위로 이동되었습니다.")

            messagebox.showerror(
                "검증 실패",
                "\n".join(msg_parts)
            )
            self.status_label.config(
                text=f"❌ 검증 실패: 중복 {total_duplicates}건 / 빈 값 {empty_count}건",
                fg="red"
            )
        else:
            messagebox.showinfo(
                "검증 통과",
                "✅ 모든 증권번호가 고유합니다!\n\n모든 증권번호가 서로 다른 값이며,\n빈 값도 없습니다."
            )
            self.status_label.config(
                text="✅ 증권번호 검증 통과 (100% 고유)",
                fg="green"
            )

    def delete_selected_rows(self):
        """선택된 행들을 삭제"""
        if not self.dataframes:
            messagebox.showwarning("경고", "먼저 엑셀 파일을 로드하세요")
            return

        # 현재 활성 탭 가져오기
        current_tab = self.notebook.index(self.notebook.select())
        sheet_names = list(self.dataframes.keys())

        if current_tab >= len(sheet_names):
            return

        sheet_name = sheet_names[current_tab]
        tree = self.treeviews.get(sheet_name)

        if not tree:
            return

        # 선택된 아이템들 가져오기
        selected_items = tree.selection()

        if not selected_items:
            messagebox.showinfo("알림", "삭제할 행을 선택하세요")
            return

        # 확인 메시지
        count = len(selected_items)
        if not messagebox.askyesno("확인", f"선택된 {count}개 행을 삭제하시겠습니까?"):
            return

        # 삭제할 행 번호들 추출 (엑셀 행 번호 -> DataFrame 인덱스)
        rows_to_delete = []
        for item in selected_items:
            # text는 엑셀 행 번호 (DataFrame 인덱스 + 2)
            excel_row = int(tree.item(item)['text'])
            df_index = excel_row - 2
            rows_to_delete.append(df_index)

        # DataFrame에서 행 삭제
        df = self.dataframes[sheet_name]
        df = df.drop(rows_to_delete)
        # 인덱스 재설정
        df = df.reset_index(drop=True)
        self.dataframes[sheet_name] = df

        # Treeview에서 선택된 행들 삭제
        for item in selected_items:
            tree.delete(item)

        # 남은 행들의 행 번호 업데이트
        for idx, item in enumerate(tree.get_children()):
            tree.item(item, text=str(idx + 2))

        self.status_label.config(
            text=f"✅ {count}개 행 삭제 완료 (남은 행: {len(df):,}개)",
            fg="gray"
        )

    def save_refined_file(self):
        """정제된 데이터를 새 엑셀 파일로 저장"""
        if not self.dataframes:
            messagebox.showwarning("경고", "먼저 엑셀 파일을 로드하세요")
            return

        # 저장할 파일 경로 선택
        if self.file_path:
            # 원본 파일명에 "_정제됨" 추가
            original_path = Path(self.file_path)
            default_name = original_path.stem + "_정제됨" + original_path.suffix
        else:
            default_name = "정제된_엑셀.xlsx"

        save_path = filedialog.asksaveasfilename(
            title="정제된 파일 저장",
            defaultextension=".xlsx",
            initialfile=default_name,
            filetypes=[
                ("Excel files", "*.xlsx"),
                ("All files", "*.*")
            ]
        )

        if not save_path:
            return

        try:
            # 모든 시트를 엑셀 파일로 저장
            with pd.ExcelWriter(save_path, engine='openpyxl') as writer:
                for sheet_name, df in self.dataframes.items():
                    df.to_excel(writer, sheet_name=sheet_name, index=False)

            total_rows = sum(len(df) for df in self.dataframes.values())
            messagebox.showinfo(
                "저장 완료",
                f"✅ 정제된 파일이 저장되었습니다!\n\n"
                f"파일: {Path(save_path).name}\n"
                f"시트: {len(self.dataframes)}개\n"
                f"총 행수: {total_rows:,}개"
            )

            self.status_label.config(
                text=f"✅ 파일 저장 완료: {Path(save_path).name}",
                fg="green"
            )

        except Exception as e:
            messagebox.showerror("오류", f"파일 저장 실패:\n{e}")
            self.status_label.config(text=f"❌ 저장 오류: {e}", fg="red")

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
                text=f"✅ 로드 완료: {len(excel_file.sheet_names)}개 시트, 총 {total_rows:,}행",
                fg="gray"
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
            style="Excel.Treeview",
            selectmode='extended'  # 다중 선택 가능
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
                    # 엑셀 행 번호 = DataFrame 인덱스 + 2 (헤더가 1행)
                    tree.insert("", tk.END, text=str(idx + 2), values=vals, tags=(tag,))
            else:
                # 칼럼 정렬
                sorted_df = df.sort_values(by=col, ascending=asc)
                for i, (idx, row) in enumerate(sorted_df.iterrows()):
                    vals = [self.format_cell_value(c, row[c]) for c in columns]
                    tag = 'evenrow' if i % 2 == 0 else 'oddrow'
                    # 엑셀 행 번호 = DataFrame 인덱스 + 2 (헤더가 1행)
                    tree.insert("", tk.END, text=str(idx + 2), values=vals, tags=(tag,))

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
        # 빈 증권번호 표시 태그 (노란색 배경)
        tree.tag_configure('empty', background='#FFF9C4', foreground='#F57C00')
        # 중복 행 표시 태그 (빨간색 배경)
        tree.tag_configure('duplicate', background='#FFE5E5', foreground='#D32F2F')

        # 데이터 삽입 (포맷팅 적용)
        for idx, row in df.iterrows():
            values = [self.format_cell_value(col, row[col]) for col in columns]
            # 홀수/짝수 행에 다른 배경색
            tag = 'evenrow' if idx % 2 == 0 else 'oddrow'
            # 엑셀 행 번호 = DataFrame 인덱스 + 2 (헤더가 1행)
            tree.insert("", tk.END, text=str(idx + 2), values=values, tags=(tag,))

        # Treeview 저장 (검증 기능에서 사용)
        self.treeviews[sheet_name] = tree

        tree.pack(fill=tk.BOTH, expand=True)


def main():
    root = TkinterDnD.Tk()
    app = ExcelRefinerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
