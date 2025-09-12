/**
 * DocumentDetailModal - 문서 상세 정보 모달 컴포넌트
 * DocumentStatusDashboard에서 분리한 모달 전용 컴포넌트
 */

import React, { useState } from "react";
import { Modal, Button, Space, Tabs } from 'antd';
import { FileText, Copy, Link, Settings, Database, Package } from "lucide-react";

const { TabPane } = Tabs;

const DocumentDetailModal = ({ 
  isVisible, 
  onClose, 
  selectedDoc, 
  extractFilename,
  extractSaveName 
}) => {
  const [copied, setCopied] = useState({});

  const handleCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
    }
  };

  if (!selectedDoc) return null;

  const filename = extractFilename(selectedDoc);
  const saveName = extractSaveName(selectedDoc);

  return (
    <Modal
      title={null}
      open={isVisible}
      onCancel={onClose}
      width={800}
      footer={null}
      className="document-detail-modal"
    >
      {/* Modal Header */}
      <div className="p-xl border-b">
        <div className="flex-center gap-md">
          <FileText className="icon-xl text-primary" />
          <div className="flex-column gap-xs">
            <h2 className="text-xl font-semibold m-0 text-primary">{filename}</h2>
            {saveName && (
              <p className="text-base text-tertiary m-0">Server file: {saveName}</p>
            )}
            <div className="mt-xs">
              <span className={`status-badge status-${selectedDoc.status}`}>
                {selectedDoc.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Content */}
      <div className="p-xl overflow-auto" style={{ maxHeight: '60vh' }}>
        <Tabs defaultActiveKey="progress">
          <TabPane tab="Processing Progress" key="progress">
            <div className="flex-column gap-lg">
              <h3 className="font-medium text-primary mb-sm">Processing Progress</h3>
              
              {/* Progress Overview */}
              <div className="progress-bar" style={{ height: '8px' }}>
                <div 
                  className={`progress-bar-fill ${selectedDoc.status}`}
                  style={{ width: `${selectedDoc.progress || 0}%` }}
                />
              </div>
              
              <div className="flex-between text-base">
                <div className="mt-xs">
                  <span className="text-tertiary">Progress:</span>
                  <p className="text-primary m-0">{selectedDoc.progress || 0}%</p>
                </div>
                
                <div className="mt-xs">
                  <span className="text-tertiary">Filename:</span>
                  <p className="text-primary m-0" style={{ wordBreak: 'break-all' }}>{filename}</p>
                </div>
                
                <div className="mt-xs">
                  <span className="text-tertiary">Status:</span>
                  <p className="text-primary m-0">{selectedDoc.status}</p>
                </div>
              </div>
            </div>
          </TabPane>

          <TabPane tab="Document Info" key="info">
            <div className="flex-column gap-md">
              <div className="flex-between p-sm bg-surface-2 rounded">
                <span className="text-secondary">Document ID:</span>
                <div className="flex-center gap-xs">
                  <code className="text-xs">{selectedDoc._id}</code>
                  <Copy 
                    className={`icon-sm cursor-pointer ${copied.id ? 'text-success' : 'text-tertiary'}`}
                    onClick={() => handleCopy(selectedDoc._id, 'id')}
                  />
                </div>
              </div>
              
              <div className="flex-between p-sm bg-surface-2 rounded">
                <span className="text-secondary">Filename:</span>
                <div className="flex-center gap-xs">
                  <span className="text-sm">{filename}</span>
                  <Copy 
                    className={`icon-sm cursor-pointer ${copied.filename ? 'text-success' : 'text-tertiary'}`}
                    onClick={() => handleCopy(filename, 'filename')}
                  />
                </div>
              </div>

              {saveName && (
                <div className="flex-between p-sm bg-surface-2 rounded">
                  <span className="text-secondary">Server Name:</span>
                  <div className="flex-center gap-xs">
                    <code className="text-xs">{saveName}</code>
                    <Copy 
                      className={`icon-sm cursor-pointer ${copied.saveName ? 'text-success' : 'text-tertiary'}`}
                      onClick={() => handleCopy(saveName, 'saveName')}
                    />
                  </div>
                </div>
              )}
            </div>
          </TabPane>

          <TabPane tab="Raw Data" key="raw">
            <div className="p-sm bg-surface-2 rounded overflow-auto" style={{ maxHeight: '300px' }}>
              <pre className="text-xs font-mono">
                {JSON.stringify(selectedDoc, null, 2)}
              </pre>
            </div>
          </TabPane>
        </Tabs>
      </div>

      {/* Modal Footer */}
      <div className="flex-end gap-sm p-lg border-t">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
};

export default DocumentDetailModal;