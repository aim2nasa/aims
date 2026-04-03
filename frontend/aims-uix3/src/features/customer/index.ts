/**
 * Customer Feature — Public API
 *
 * 이 feature 외부에서 접근할 때는 반드시 이 barrel export를 사용하세요.
 * 내부 파일 직접 import 금지.
 */

// 공용 컴포넌트
export { CustomerDocumentPreviewModal } from './views/CustomerDetailView/tabs/CustomerDocumentPreviewModal';

// 공용 유틸 (AR/CRS PDF 파싱)
export { checkAnnualReportFromPDF, checkCustomerReviewFromPDF } from './utils/pdfParser';

// 공용 API
export { AnnualReportApi } from './api/annualReportApi';
export type { AnnualReport } from './api/annualReportApi';
export { CustomerReviewApi } from './api/customerReviewApi';
export type { CustomerReview } from './api/customerReviewApi';
