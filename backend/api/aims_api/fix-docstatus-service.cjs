const fs = require('fs');
const file = 'D:/aims/frontend/aims-uix3/src/services/DocumentStatusService.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. getDocumentStatus 수정
const old1 = `static async getDocumentStatus(documentId: string): Promise<DocumentDetailResponse> {
    try {
      const response = await fetch(\`\${API_BASE_URL}/api/documents/\${documentId}/status\`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      })`;

const new1 = `static async getDocumentStatus(documentId: string): Promise<DocumentDetailResponse> {
    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester';
      const response = await fetch(\`\${API_BASE_URL}/api/documents/\${documentId}/status\`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        mode: 'cors'
      })`;

if (content.includes(old1)) {
  content = content.replace(old1, new1);
  console.log('✅ getDocumentStatus 수정 완료');
} else {
  console.log('❌ getDocumentStatus - 대상 코드를 찾을 수 없음');
}

// 2. getDocumentDetailViaWebhook 수정
const old2 = `static async getDocumentDetailViaWebhook(documentId: string): Promise<Document | Record<string, unknown> | null> {
    try {
      const response = await fetch(\`\${API_BASE_URL}/api/documents/\${documentId}/status\`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      })`;

const new2 = `static async getDocumentDetailViaWebhook(documentId: string): Promise<Document | Record<string, unknown> | null> {
    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester';
      const response = await fetch(\`\${API_BASE_URL}/api/documents/\${documentId}/status\`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        mode: 'cors'
      })`;

if (content.includes(old2)) {
  content = content.replace(old2, new2);
  console.log('✅ getDocumentDetailViaWebhook 수정 완료');
} else {
  console.log('❌ getDocumentDetailViaWebhook - 대상 코드를 찾을 수 없음');
}

fs.writeFileSync(file, content, 'utf8');
console.log('\n수정 완료');
