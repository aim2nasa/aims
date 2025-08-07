import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import requests
import json

API_URL = "https://n8nd.giize.com/webhook/smartsearch"

class SmartSearchApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SmartSearch Viewer")
        self.root.geometry("1000x600")

        self.query_frame = tk.Frame(root)
        self.query_frame.pack(fill=tk.X, pady=5, padx=5)

        tk.Label(self.query_frame, text="검색어:").pack(side=tk.LEFT)
        self.query_entry = tk.Entry(self.query_frame, width=50)
        self.query_entry.pack(side=tk.LEFT, padx=5)
        tk.Button(self.query_frame, text="검색", command=self.search).pack(side=tk.LEFT)

        self.result_tree = ttk.Treeview(root, columns=("filename", "summary"), show="headings")
        self.result_tree.heading("filename", text="파일명")
        self.result_tree.heading("summary", text="요약")
        self.result_tree.column("filename", width=300)
        self.result_tree.column("summary", width=660)
        self.result_tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.detail_text = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=10)
        self.detail_text.pack(fill=tk.X, padx=5, pady=(0,5))

        self.result_tree.bind("<Double-1>", self.show_details)
        self.data = []

    def search(self):
        query = self.query_entry.get().strip()
        if not query:
            messagebox.showwarning("입력 오류", "검색어를 입력해주세요.")
            return

        try:
            response = requests.post(API_URL, json={"query": query})
            response.raise_for_status()
            self.data = response.json()
            self.populate_table()
        except Exception as e:
            messagebox.showerror("오류", f"검색 중 오류 발생: {e}")

    def populate_table(self):
        for row in self.result_tree.get_children():
            self.result_tree.delete(row)

        for item in self.data:
            filename = item.get("originalName", "(이름 없음)")
            summary = item.get("ocr", {}).get("summary", "(요약 없음)")
            self.result_tree.insert("", "end", values=(filename, summary))

    def show_details(self, event):
        selected = self.result_tree.selection()
        if not selected:
            return
        index = self.result_tree.index(selected[0])
        full_text = self.data[index].get("ocr", {}).get("full_text", "(내용 없음)")
        self.detail_text.delete("1.0", tk.END)
        self.detail_text.insert(tk.END, full_text)

if __name__ == "__main__":
    root = tk.Tk()
    app = SmartSearchApp(root)
    root.mainloop()
