#!/bin/bash
# 테스트용 데이터 생성 스크립트

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}테스트용 데이터 생성 중...${NC}"

# MongoDB에 테스트 문서 및 고객 생성
docker exec aims-api node -e "
const { MongoClient, ObjectId } = require('mongodb');

(async () => {
  try {
    const client = new MongoClient('mongodb://localhost:27017/');
    await client.connect();
    const db = client.db('docupload');

    // 1. 테스트 문서 생성
    const testDoc = {
      upload: {
        originalName: 'test_document.pdf',
        uploadedBy: 'test_user_123',
        uploaded_at: new Date().toISOString()
      },
      meta: {
        mime: 'application/pdf',
        full_text: '이것은 Qdrant customer_id 동기화 테스트용 문서입니다. '.repeat(100)
      },
      ocr: {},
      tags: []
    };

    const docResult = await db.collection('files').insertOne(testDoc);
    console.log('DOC_ID=' + docResult.insertedId.toString());

    // 2. 테스트 고객 A, B 생성
    const customerA = {
      personal_info: { name: '테스트고객A' },
      meta: { created_at: new Date().toISOString() },
      documents: []
    };

    const customerB = {
      personal_info: { name: '테스트고객B' },
      meta: { created_at: new Date().toISOString() },
      documents: []
    };

    const custAResult = await db.collection('customers').insertOne(customerA);
    const custBResult = await db.collection('customers').insertOne(customerB);

    console.log('CUSTOMER_A=' + custAResult.insertedId.toString());
    console.log('CUSTOMER_B=' + custBResult.insertedId.toString());

    await client.close();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 테스트 데이터 생성 완료${NC}"
else
    echo -e "\033[0;31m❌ 테스트 데이터 생성 실패${NC}"
    exit 1
fi
