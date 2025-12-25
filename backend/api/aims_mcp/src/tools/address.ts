import { z } from 'zod';
import { sendErrorLog } from '../systemLogger.js';

// 환경변수 또는 기본값
const AIMS_API_URL = process.env.AIMS_API_URL || 'http://localhost:3010';

// 스키마 정의
export const searchAddressSchema = z.object({
  keyword: z.string().min(1).describe('검색할 주소 (도로명 또는 지번). 예: "테헤란로 123", "역삼동 123-45"'),
  page: z.number().optional().default(1).describe('페이지 번호 (기본: 1)'),
  size: z.number().optional().default(10).describe('결과 개수 (기본: 10, 최대: 30)')
});

// Tool 정의
export const addressToolDefinitions = [
  {
    name: 'search_address',
    description: '한국 주소를 검색합니다. 도로명 또는 지번주소로 검색하여 우편번호와 정확한 주소를 찾습니다. 고객 주소 수정 시 반드시 이 도구로 먼저 주소를 검색하여 검증된 주소를 선택해야 합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '검색할 주소 (도로명 또는 지번). 예: "테헤란로 123", "역삼동 123-45"'
        },
        page: {
          type: 'number',
          description: '페이지 번호 (기본: 1)'
        },
        size: {
          type: 'number',
          description: '결과 개수 (기본: 10, 최대: 30)'
        }
      },
      required: ['keyword']
    }
  }
];

// 주소 검색 결과 인터페이스
interface AddressSearchResult {
  roadAddr: string;
  roadAddrPart1: string;
  jibunAddr: string;
  zipNo: string;
  siNm: string;
  sggNm: string;
  emdNm: string;
  building_name: string;
}

// API 응답 인터페이스
interface AddressSearchApiResponse {
  success: boolean;
  data?: {
    results: AddressSearchResult[];
    total: number;
    page: number;
    size: number;
    totalPages: number;
    is_end: boolean;
  };
  error?: string;
}

/**
 * 주소 검색 핸들러
 */
export async function handleSearchAddress(args: unknown): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    const params = searchAddressSchema.parse(args);
    const { keyword, page = 1, size = 10 } = params;

    // AIMS API의 주소 검색 엔드포인트 호출
    const url = `${AIMS_API_URL}/api/address/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${Math.min(size, 30)}`;

    console.error(`[search_address] API 호출: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`주소 검색 API 오류: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as AddressSearchApiResponse;

    if (!data.success) {
      return {
        content: [{
          type: 'text',
          text: `주소 검색 실패: ${data.error || '알 수 없는 오류'}`
        }],
        isError: true
      };
    }

    const results: AddressSearchResult[] = data.data?.results || [];
    const total = data.data?.total || 0;

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `"${keyword}"에 대한 검색 결과가 없습니다. 다른 검색어로 시도해보세요.`
        }]
      };
    }

    // 결과 포맷팅
    const formattedResults = results.map((addr, index) => {
      const parts = [
        `${index + 1}. [${addr.zipNo || '우편번호없음'}] ${addr.roadAddrPart1 || addr.roadAddr}`
      ];

      if (addr.building_name) {
        parts.push(`   건물명: ${addr.building_name}`);
      }

      if (addr.jibunAddr && addr.jibunAddr !== addr.roadAddrPart1) {
        parts.push(`   지번: ${addr.jibunAddr}`);
      }

      return parts.join('\n');
    });

    const resultText = [
      `📍 주소 검색 결과 (${results.length}건${total > results.length ? ` / 총 ${total}건` : ''})`,
      '',
      ...formattedResults,
      '',
      '---',
      '💡 위 결과 중 하나를 선택하여 고객 주소를 수정하세요.',
      '예: "1번 주소로 수정해줘" 또는 "첫번째 주소 선택"'
    ].join('\n');

    return {
      content: [{
        type: 'text',
        text: resultText
      }]
    };

  } catch (error) {
    console.error('[search_address] 오류:', error);
    sendErrorLog('aims_mcp', 'search_address 오류', error);

    return {
      content: [{
        type: 'text',
        text: `주소 검색 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }],
      isError: true
    };
  }
}
