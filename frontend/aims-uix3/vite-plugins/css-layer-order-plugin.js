/**
 * CSS @layer 순서 선언을 빌드 출력 CSS 맨 앞에 삽입하는 Vite 플러그인
 *
 * 문제: Vite의 CSS 번들링은 모듈 의존성 그래프 순서로 CSS를 배치한다.
 * 컴포넌트 CSS(@layer components)가 index.css(@layer order 선언)보다
 * 먼저 출력되면, @layer 순서가 '첫 등장 순서'로 결정되어 의도한 계층이 깨진다.
 *
 * 해결: generateBundle 훅에서 CSS 에셋의 맨 앞에 @layer 순서 선언을 삽입한다.
 * 이미 선언이 있더라도 첫 번째 선언이 우선하므로 중복은 무해하다.
 */
export default function cssLayerOrderPlugin() {
  const LAYER_ORDER = '@layer reset,tokens,theme,base,utilities,components,views,responsive;';

  return {
    name: 'css-layer-order',
    enforce: 'post',

    generateBundle(_options, bundle) {
      for (const [key, chunk] of Object.entries(bundle)) {
        if (key.endsWith('.css') && chunk.type === 'asset') {
          const source = typeof chunk.source === 'string' ? chunk.source : '';
          // 이미 맨 앞에 @layer 순서 선언이 있으면 스킵
          if (source.startsWith('@layer reset')) return;
          chunk.source = LAYER_ORDER + source;
        }
      }
    },

    // 개발 서버에서도 @layer 순서를 보장하기 위해
    // transformIndexHtml으로 <style> 태그 삽입
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <style>${LAYER_ORDER}</style>`
      );
    }
  };
}
