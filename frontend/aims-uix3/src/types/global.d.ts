/**
 * Global Type Declarations for AIMS UIX3
 * @since 2025-09-20
 * @version 1.0.0
 */

/**
 * PDF.js Worker URL 타입 선언 (Vite ?url import)
 */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const workerUrl: string
  export default workerUrl
}

type HapticEventHandler<TEvent extends Event = Event> = (event: TEvent) => void;

interface AimsHaptic {
  triggerHaptic: (type: string, customIntensity?: number | null) => void;
  withHaptic: <TEvent extends Event = Event>(
    hapticType: string,
    originalHandler?: HapticEventHandler<TEvent> | null
  ) => HapticEventHandler<TEvent>;
  bindHapticToElement: (
    element: HTMLElement,
    hapticType: string,
    eventType?: string
  ) => (() => void) | undefined;
  isHapticEnabled: boolean;
  hapticIntensity: number;
  isReducedMotion: boolean;
  updateHapticSettings: (enabled: boolean, intensity?: number) => void;
  testHaptic: () => void;
  hapticTypes: Record<string, string>;
  success: () => void;
  error: () => void;
  warning: () => void;
  selection: () => void;
  buttonPress: () => void;
  lightTouch: () => void;
}

/**
 * File System Access API 타입 (showSaveFilePicker)
 * 스트리밍 다운로드에서 사용. 미지원 브라우저에서는 undefined.
 */
interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string | { type: string; data?: BufferSource | Blob | string; position?: number; size?: number }): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

declare global {
  interface Window {
    /** AIMS 햅틱 피드백 시스템 전역 인스턴스 */
    aimsHaptic?: AimsHaptic;
    /** File System Access API — 스트리밍 다운로드용 (Chrome/Edge) */
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

export {}
