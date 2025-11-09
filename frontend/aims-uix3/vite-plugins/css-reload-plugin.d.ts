import { Plugin } from 'vite'

/**
 * CSS 파일 변경 시 전체 페이지 리로드를 강제하는 Vite 플러그인
 *
 * Windows 환경에서 Vite의 CSS HMR이 불안정한 문제를 해결하기 위해
 * CSS 변경 시 전체 리로드 방식을 사용합니다.
 *
 * @returns Vite 플러그인 객체
 */
export default function cssReloadPlugin(): Plugin
