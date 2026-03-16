/**
 * Personal Files Service
 * @since 2.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 API 서비스
 * 바이러스 검사 통합 (ClamAV)
 */

import axios from 'axios';
import { api, API_CONFIG, getCurrentUserId } from '@/shared/lib/api';
import { scanFile, isScanAvailable } from '@/shared/lib/fileValidation/virusScanApi';

const API_BASE = '/api/personal-files';

/**
 * AIMS 표준 헤더 생성 (x-user-id 방식)
 */
const getHeaders = () => {
  return {
    'x-user-id': getCurrentUserId() || 'tester'
  };
};

/**
 * 문서 라이브러리 파일의 원본 Document 정보 (뱃지 표시용)
 * 순환 참조 방지를 위해 필요한 필드만 정의
 */
export interface PersonalFileDocument {
  _id?: string;
  badgeType?: 'TXT' | 'OCR' | 'BIN';
  mimeType?: string;
  ocr?: {
    status?: string;
    confidence?: number | string;
  };
  meta?: {
    full_text?: string;
  };
  docembed?: {
    text_source?: string;
  };
  // PersonalFilesView에서 사용하는 추가 속성들
  status?: string;
  overallStatus?: string;
  progress?: number;
  is_annual_report?: boolean;
  ownerId?: string;
  customerId?: string;
  // 추가 속성 허용을 위한 인덱스 시그니처
  [key: string]: unknown;
}

/**
 * 파일 시스템 항목 인터페이스
 */
export interface PersonalFileItem {
  _id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  size?: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  storagePath?: string;
  isLibraryDocument?: boolean; // 문서 라이브러리 파일인지 여부
  // 🍎 문서 라이브러리 파일의 원본 Document 정보 (뱃지 표시용)
  document?: PersonalFileDocument;
}

/**
 * 폴더 내용 응답 인터페이스
 */
export interface FolderContents {
  currentFolder: PersonalFileItem | null;
  items: PersonalFileItem[];
  breadcrumbs: { _id: string | null; name: string }[];
}

/**
 * API 응답 인터페이스
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Personal Files Service
 */
export const personalFilesService = {
  /**
   * 폴더 내용 조회
   * @param folderId - 폴더 ID (null이면 루트)
   */
  async getFolderContents(folderId?: string | null): Promise<FolderContents> {
    const endpoint = folderId
      ? `${API_BASE}/folders/${folderId}`
      : `${API_BASE}/folders`;

    const response = await api.get<ApiResponse<FolderContents>>(endpoint);

    if (!response.success || !response.data) {
      throw new Error(response.message || '폴더 조회 실패');
    }

    return response.data;
  },

  /**
   * 폴더 생성
   * @param name - 폴더 이름
   * @param parentId - 부모 폴더 ID
   */
  async createFolder(name: string, parentId?: string | null): Promise<PersonalFileItem> {
    const response = await api.post<ApiResponse<PersonalFileItem>>(
      `${API_BASE}/folders`,
      { name, parentId }
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || '폴더 생성 실패');
    }

    return response.data;
  },

  /**
   * 파일 업로드 (바이러스 검사 포함)
   * @param file - 업로드할 파일
   * @param parentId - 부모 폴더 ID
   * @param onProgress - 업로드 진행률 콜백
   */
  async uploadFile(
    file: File,
    parentId?: string | null,
    onProgress?: (progress: number) => void
  ): Promise<PersonalFileItem> {
    // 🛡️ 바이러스 검사 (ClamAV 활성화된 경우만)
    const scanAvailable = await isScanAvailable();
    if (scanAvailable) {
      console.log(`[PersonalFilesService] 🔍 바이러스 검사 중: ${file.name}`);
      const scanResult = await scanFile(file);

      if (scanResult.infected) {
        // 바이러스 감지됨 - 업로드 차단
        const errorMessage = `🛡️ 바이러스 감지: ${scanResult.virusName || '알 수 없는 위협'}`;
        console.warn(`[PersonalFilesService] ⚠️ ${errorMessage} - 파일: ${file.name}`);
        throw new Error(errorMessage);
      }

      if (scanResult.scanned) {
        console.log(`[PersonalFilesService] ✅ 바이러스 검사 통과: ${file.name}`);
      }
    }

    const formData = new FormData();
    formData.append('file', file);
    if (parentId) {
      formData.append('parentId', parentId);
    }

    const response = await axios.post<ApiResponse<PersonalFileItem>>(
      `${API_CONFIG.BASE_URL}${API_BASE}/upload`,
      formData,
      {
        headers: {
          ...getHeaders(),
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        }
      }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || '파일 업로드 실패');
    }

    return response.data.data;
  },

  /**
   * 항목 이름 변경
   * @param itemId - 항목 ID
   * @param newName - 새 이름
   */
  async renameItem(itemId: string, newName: string): Promise<void> {
    const response = await api.put<ApiResponse<void>>(
      `${API_BASE}/${itemId}/rename`,
      { newName }
    );

    if (!response.success) {
      throw new Error(response.message || '이름 변경 실패');
    }
  },

  /**
   * 항목 삭제
   * @param itemId - 항목 ID
   */
  async deleteItem(itemId: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(
      `${API_BASE}/${itemId}`
    );

    if (!response.success) {
      throw new Error(response.message || '삭제 실패');
    }
  },

  /**
   * 항목 이동
   * @param itemId - 이동할 항목 ID
   * @param targetFolderId - 대상 폴더 ID (null이면 루트)
   */
  async moveItem(itemId: string, targetFolderId: string | null): Promise<void> {
    const response = await api.put<ApiResponse<void>>(
      `${API_BASE}/${itemId}/move`,
      { targetFolderId }
    );

    if (!response.success) {
      throw new Error(response.message || '이동 실패');
    }
  },

  /**
   * 파일 다운로드 URL 생성
   * @param fileId - 파일 ID
   */
  getDownloadUrl(fileId: string): string {
    const currentUserId = getCurrentUserId() || 'tester';
    return `${API_CONFIG.BASE_URL}${API_BASE}/${fileId}/download?x-user-id=${encodeURIComponent(currentUserId)}`;
  },

  /**
   * 파일 다운로드
   * @param fileId - 파일 ID
   * @param fileName - 파일 이름
   */
  async downloadFile(fileId: string, fileName: string): Promise<void> {
    const response = await axios.get(
      `${API_CONFIG.BASE_URL}${API_BASE}/${fileId}/download`,
      {
        headers: getHeaders(),
        responseType: 'blob'
      }
    );

    // Blob을 다운로드
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * 파일/폴더 검색
   * @param options - 검색 옵션
   */
  async searchFiles(options: {
    q?: string;           // 검색어
    type?: 'file' | 'folder';  // 타입 필터
    dateFrom?: string;    // 시작 날짜 (YYYY-MM-DD)
    dateTo?: string;      // 종료 날짜 (YYYY-MM-DD)
    sortBy?: 'name' | 'createdAt' | 'size';  // 정렬 기준
    sortDirection?: 'asc' | 'desc';  // 정렬 방향
  }): Promise<{ items: PersonalFileItem[]; count: number }> {
    const params = new URLSearchParams();

    if (options.q) params.append('q', options.q);
    if (options.type) params.append('type', options.type);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortDirection) params.append('sortDirection', options.sortDirection);

    const response = await api.get<ApiResponse<{ items: PersonalFileItem[]; count: number }>>(
      `${API_BASE}/search?${params.toString()}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || '검색 실패');
    }

    return response.data;
  },

  /**
   * 문서 라이브러리 파일을 폴더로 이동
   * @param documentId - 문서 ID
   * @param targetFolderId - 대상 폴더 ID (null이면 루트)
   */
  async moveDocument(documentId: string, targetFolderId: string | null): Promise<void> {
    const response = await api.put<ApiResponse<void>>(
      `${API_BASE}/documents/${documentId}/move`,
      { targetFolderId }
    );

    if (!response.success) {
      throw new Error(response.message || '문서 이동 실패');
    }
  },

  /**
   * 문서 라이브러리 파일 이름 변경
   * @param documentId - 문서 ID
   * @param newName - 새 파일명
   */
  async renameDocument(documentId: string, newName: string): Promise<void> {
    const response = await api.put<ApiResponse<void>>(
      `${API_BASE}/documents/${documentId}/rename`,
      { newName }
    );

    if (!response.success) {
      throw new Error(response.message || '문서 이름 변경 실패');
    }
  }
};

export default personalFilesService;
