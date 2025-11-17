/**
 * Personal Files Service
 * @since 2.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 API 서비스
 */

import axios from 'axios';

const API_BASE = 'http://tars.giize.com:3010/api/personal-files';

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
 * 인증 헤더 생성
 */
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    Authorization: `Bearer ${token}`
  };
};

/**
 * Personal Files Service
 */
export const personalFilesService = {
  /**
   * 폴더 내용 조회
   * @param folderId - 폴더 ID (null이면 루트)
   */
  async getFolderContents(folderId?: string | null): Promise<FolderContents> {
    const url = folderId
      ? `${API_BASE}/folders/${folderId}`
      : `${API_BASE}/folders`;

    const response = await axios.get<ApiResponse<FolderContents>>(url, {
      headers: getAuthHeaders()
    });

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || '폴더 조회 실패');
    }

    return response.data.data;
  },

  /**
   * 폴더 생성
   * @param name - 폴더 이름
   * @param parentId - 부모 폴더 ID
   */
  async createFolder(name: string, parentId?: string | null): Promise<PersonalFileItem> {
    const response = await axios.post<ApiResponse<PersonalFileItem>>(
      `${API_BASE}/folders`,
      { name, parentId },
      { headers: getAuthHeaders() }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || '폴더 생성 실패');
    }

    return response.data.data;
  },

  /**
   * 파일 업로드
   * @param file - 업로드할 파일
   * @param parentId - 부모 폴더 ID
   */
  async uploadFile(file: File, parentId?: string | null): Promise<PersonalFileItem> {
    const formData = new FormData();
    formData.append('file', file);
    if (parentId) {
      formData.append('parentId', parentId);
    }

    const response = await axios.post<ApiResponse<PersonalFileItem>>(
      `${API_BASE}/upload`,
      formData,
      {
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'multipart/form-data'
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
    const response = await axios.put<ApiResponse<void>>(
      `${API_BASE}/${itemId}/rename`,
      { newName },
      { headers: getAuthHeaders() }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || '이름 변경 실패');
    }
  },

  /**
   * 항목 삭제
   * @param itemId - 항목 ID
   */
  async deleteItem(itemId: string): Promise<void> {
    const response = await axios.delete<ApiResponse<void>>(
      `${API_BASE}/${itemId}`,
      { headers: getAuthHeaders() }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || '삭제 실패');
    }
  },

  /**
   * 파일 다운로드 URL 생성
   * @param fileId - 파일 ID
   */
  getDownloadUrl(fileId: string): string {
    const token = localStorage.getItem('authToken');
    return `${API_BASE}/${fileId}/download?token=${encodeURIComponent(token || '')}`;
  },

  /**
   * 파일 다운로드
   * @param fileId - 파일 ID
   * @param fileName - 파일 이름
   */
  async downloadFile(fileId: string, fileName: string): Promise<void> {
    const response = await axios.get(
      `${API_BASE}/${fileId}/download`,
      {
        headers: getAuthHeaders(),
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
  }
};

export default personalFilesService;
