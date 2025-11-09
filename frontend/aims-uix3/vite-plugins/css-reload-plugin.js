/**
 * CSS 파일 변경 시 전체 페이지 리로드를 강제하는 Vite 플러그인
 *
 * Windows에서 Vite CSS HMR이 불안정하므로,
 * CSS 변경 감지 → 전체 페이지 리로드로 안정성 확보
 */

export default function cssReloadPlugin() {
  return {
    name: 'css-reload-plugin',

    handleHotUpdate({ file, server }) {
      // CSS 파일 변경 감지
      if (file.endsWith('.css')) {
        console.log(`[CSS-Reload] ${file} changed - triggering full reload`)

        // tokens.css 변경 시 main.tsx 무효화 (확실한 반영)
        if (file.includes('tokens.css')) {
          const mainModule = server.moduleGraph.getModuleById('\0vite/preload-helper.js')
          if (mainModule) {
            server.moduleGraph.invalidateModule(mainModule)
          }
        }

        // 전체 페이지 리로드 강제
        server.ws.send({
          type: 'full-reload',
          path: '*'
        })

        // 모든 모듈 무효화
        return []
      }
    }
  }
}
