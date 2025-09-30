/**
 * Download Helper
 * @since 1.0.0
 *
 * 문서 파일 다운로드 유틸리티
 */

interface DownloadOptions {
  showMessage?: boolean;
}

interface DocumentData {
  _id: string;
  fileUrl?: string;
  upload?: {
    originalName?: string;
    destPath?: string;
  };
  payload?: {
    original_name?: string;
    dest_path?: string;
  };
}

class DownloadHelper {
  /**
   * 문서 파일 다운로드
   * @param doc - 문서 객체
   * @param options - 옵션 설정
   */
  static async downloadDocument(doc: DocumentData, options: DownloadOptions = {}): Promise<{ success: boolean; error?: string }> {
    const { showMessage = true } = options;

    try {
      // 파일 경로와 원본 이름 추출
      const destPath = doc.upload?.destPath || doc.payload?.dest_path;
      const originalName = doc.upload?.originalName || doc.payload?.original_name;

      if (!destPath) {
        throw new Error('파일 경로를 찾을 수 없습니다.');
      }

      if (!originalName) {
        throw new Error('파일명을 찾을 수 없습니다.');
      }

      // 서버 경로 정규화
      const normalizedPath = destPath.startsWith('/data')
        ? destPath.replace('/data', '')
        : destPath;

      const fileUrl = `https://tars.giize.com${normalizedPath}`;

      // 파일 다운로드 실행
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(`파일 다운로드 실패: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      // 다운로드 링크 생성 및 클릭
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = originalName;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      // 정리
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      if (showMessage) {
        console.log('파일이 다운로드되었습니다:', originalName);
      }

      return {
        success: true
      };
    } catch (error) {
      console.error('DownloadHelper.downloadDocument:', error);

      if (showMessage) {
        console.error('파일 다운로드 중 오류가 발생했습니다:', error);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      };
    }
  }
}

export default DownloadHelper;
