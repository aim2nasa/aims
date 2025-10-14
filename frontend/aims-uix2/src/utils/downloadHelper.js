import { message } from 'antd';

class DownloadHelper {
  /**
   * 문서 파일 다운로드 공통 함수
   * @param {Object} document - 문서 객체 
   * @param {Object} options - 옵션 설정
   * @param {boolean} options.showMessage - 성공/실패 메시지 표시 여부 (기본값: true)
   */
  static async downloadDocument(document, options = {}) {
    const { showMessage = true } = options;
    
    try {
      // 파일 경로와 원본 이름 추출
      const destPath = document.upload?.destPath || document.payload?.dest_path;
      const originalName = document.upload?.originalName || document.payload?.original_name;
      
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
        message.success('파일이 다운로드되었습니다.');
      }
      
      return {
        success: true,
        filename: originalName
      };
      
    } catch (error) {
      console.error('DownloadHelper.downloadDocument:', error);
      
      if (showMessage) {
        message.error('파일 다운로드에 실패했습니다: ' + error.message);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 여러 파일 일괄 다운로드
   * @param {Array} documents - 문서 객체 배열
   * @param {Object} options - 옵션 설정
   */
  static async downloadMultipleDocuments(documents, options = {}) {
    const { showMessage = true } = options;
    const results = [];
    
    if (showMessage) {
      message.loading(`${documents.length}개 파일 다운로드 중...`);
    }
    
    for (const doc of documents) {
      const result = await this.downloadDocument(doc, { showMessage: false });
      results.push({
        document: doc,
        result
      });
      
      // 다운로드 간격 (서버 부하 방지)
      if (documents.length > 5) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const successful = results.filter(r => r.result.success).length;
    const failed = results.length - successful;
    
    if (showMessage) {
      if (failed === 0) {
        message.success(`${successful}개 파일 다운로드가 완료되었습니다.`);
      } else {
        message.warning(`${successful}개 파일 다운로드 완료, ${failed}개 파일 실패`);
      }
    }
    
    return {
      success: failed === 0,
      successful,
      failed,
      results
    };
  }

  /**
   * 파일 URL 생성 (미리보기용)
   * @param {Object} document - 문서 객체
   */
  static getFileUrl(document) {
    const destPath = document.upload?.destPath || document.payload?.dest_path;
    
    if (!destPath) {
      return null;
    }
    
    const normalizedPath = destPath.startsWith('/data') 
      ? destPath.replace('/data', '') 
      : destPath;
    
    return `https://tars.giize.com${normalizedPath}`;
  }

  /**
   * 파일 타입 확인
   * @param {Object} document - 문서 객체
   */
  static getFileType(document) {
    const originalName = document.upload?.originalName || document.payload?.original_name;
    
    if (!originalName) {
      return 'unknown';
    }
    
    const extension = originalName.split('.').pop()?.toLowerCase();
    
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const pdfTypes = ['pdf'];
    const docTypes = ['doc', 'docx', 'hwp'];
    const excelTypes = ['xls', 'xlsx'];
    const textTypes = ['txt', 'csv'];
    
    if (imageTypes.includes(extension)) return 'image';
    if (pdfTypes.includes(extension)) return 'pdf';
    if (docTypes.includes(extension)) return 'document';
    if (excelTypes.includes(extension)) return 'excel';
    if (textTypes.includes(extension)) return 'text';
    
    return 'other';
  }
}

export default DownloadHelper;