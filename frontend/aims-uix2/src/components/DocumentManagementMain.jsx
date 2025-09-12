import React from 'react';
import { Card } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

const DocumentManagementMain = () => {
  return (
    <Card
      title={
        <div className="flex-items-center gap-sm">
          <FileTextOutlined />
          <span className="text-xl font-semibold text-primary">문서 관리</span>
        </div>
      }
      className="h-screen-140 rounded"
    >
      <div className="p-2xl max-w-800 mx-auto">
        {/* 제목 및 설명 */}
        <div className="text-center mb-2xl">
          <FileTextOutlined className="mb-lg text-4xl text-primary" />
          <h2 className="text-3xl font-bold text-primary mb-md">
            AI 기반 지능형 문서 관리 시스템
          </h2>
          <p className="text-lg text-secondary m-0 line-height-1_6">
            보험 문서의 자동 분류, OCR 처리, 태깅 및 케이스 그룹화를 통해<br/>
            반복적인 사무 업무를 자동화하고 업무 효율성을 극대화하세요.
          </p>
        </div>

        {/* 주요 기능 */}
        <div className="grid mb-2xl gap-lg grid-auto-fit-250">
          <div className="p-lg bg-secondary rounded border">
            <h3 className="text-lg font-semibold text-primary mb-sm">
              📄 자동 문서 분류
            </h3>
            <p className="text-secondary text-sm m-0 line-height-1_5">
              AI가 업로드된 문서를 자동으로 분석하여 보험청구서, 진단서 등으로 자동 분류합니다.
            </p>
          </div>
          <div className="p-lg bg-secondary rounded border">
            <h3 className="text-lg font-semibold text-primary mb-sm">
              🔍 OCR 텍스트 추출
            </h3>
            <p className="text-secondary text-sm m-0 line-height-1_5">
              이미지와 PDF 문서에서 텍스트를 자동 추출하여 검색 가능한 데이터로 변환합니다.
            </p>
          </div>
          <div className="p-lg bg-secondary rounded border">
            <h3 className="text-lg font-semibold text-primary mb-sm">
              🏷️ 스마트 태깅
            </h3>
            <p className="text-secondary text-sm m-0 line-height-1_5">
              문서 내용을 분석하여 관련 태그를 자동 생성하고, 빠른 검색과 분류를 지원합니다.
            </p>
          </div>
          <div className="p-lg bg-secondary rounded border">
            <h3 className="text-lg font-semibold text-primary mb-sm">
              📁 케이스 그룹화
            </h3>
            <p className="text-secondary text-sm m-0 line-height-1_5">
              관련된 문서들을 사건별로 자동 그룹화하여 케이스 관리를 체계적으로 지원합니다.
            </p>
          </div>
        </div>

        {/* 안내 메시지 */}
        <div className="text-center p-lg bg-tertiary rounded border">
          <h4 className="text-base font-semibold text-primary mb-xs">
            문서 처리 현황을 확인하려면
          </h4>
          <p className="text-sm text-secondary m-0">
            좌측 메뉴에서 '문서 처리 현황'을 클릭하여 실시간 문서 처리 상태를 모니터링하세요.
          </p>
        </div>
      </div>
    </Card>
  );
};

export default DocumentManagementMain;