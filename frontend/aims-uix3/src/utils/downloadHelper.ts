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
      const destPath = doc.upload?.destPath || doc.payload?.dest_path;
      const originalName =
        doc.upload?.originalName ||
        doc.payload?.original_name ||
        `download-${doc._id}`;

      const resolvedUrl = (() => {
        if (doc.fileUrl) {
          return doc.fileUrl;
        }

        if (destPath) {
          const normalizedPath = destPath.startsWith('/data')
            ? destPath.replace('/data', '')
            : destPath;
          return `https://tars.giize.com${normalizedPath}`;
        }

        throw new Error('다운로드할 파일 경로를 찾을 수 없습니다.');
      })();

      // 파일 다운로드 실행
      const response = await fetch(resolvedUrl);

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
