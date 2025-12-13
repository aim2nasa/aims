import FileConverter from './components/FileConverter'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>PDF Converter POC</h1>
        <p>문서를 PDF로 변환하는 테스트 페이지입니다.</p>
      </header>
      <main className="app-main">
        <FileConverter />
      </main>
      <footer className="app-footer">
        <p>지원 형식: DOCX, XLSX, PPTX, HWP, CSV, ODT, RTF, TXT, HTML</p>
        <p className="warning">HWP는 베타 지원입니다 (일부 서식 손실 가능)</p>
      </footer>
    </div>
  )
}

export default App
