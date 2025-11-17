/**
 * Personal Files API 테스트 스크립트
 *
 * 실행 방법:
 * node test-personal-files-api.js
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

// JWT 시크릿 (실제 환경변수에서 가져와야 하지만, 테스트용으로 하드코딩)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// 테스트 사용자 ID
const TEST_USER_ID = '테스트사용자ID';  // MongoDB users 컬렉션의 실제 사용자 ID

// JWT 토큰 생성
const token = jwt.sign(
  { userId: TEST_USER_ID, username: 'testuser' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const API_BASE = 'http://localhost:3010/api/personal-files';
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

async function testPersonalFilesAPI() {
  console.log('🔑 JWT 토큰:', token.substring(0, 50) + '...\n');

  try {
    // 1. 루트 폴더 조회
    console.log('1️⃣ 루트 폴더 조회 (GET /folders)');
    const rootResponse = await axios.get(`${API_BASE}/folders`, { headers });
    console.log('✅ 성공:', JSON.stringify(rootResponse.data, null, 2));
    console.log('');

    // 2. 폴더 생성
    console.log('2️⃣ 폴더 생성 (POST /folders)');
    const createFolderResponse = await axios.post(
      `${API_BASE}/folders`,
      { name: '테스트 폴더 ' + Date.now(), parentId: null },
      { headers }
    );
    console.log('✅ 성공:', JSON.stringify(createFolderResponse.data, null, 2));
    const newFolderId = createFolderResponse.data.data._id;
    console.log('');

    // 3. 생성된 폴더 내용 조회
    console.log('3️⃣ 폴더 내용 조회 (GET /folders/:folderId)');
    const folderResponse = await axios.get(`${API_BASE}/folders/${newFolderId}`, { headers });
    console.log('✅ 성공:', JSON.stringify(folderResponse.data, null, 2));
    console.log('');

    // 4. 폴더 이름 변경
    console.log('4️⃣ 폴더 이름 변경 (PUT /:itemId/rename)');
    const renameResponse = await axios.put(
      `${API_BASE}/${newFolderId}/rename`,
      { newName: '변경된 폴더명' },
      { headers }
    );
    console.log('✅ 성공:', JSON.stringify(renameResponse.data, null, 2));
    console.log('');

    // 5. 하위 폴더 생성
    console.log('5️⃣ 하위 폴더 생성 (POST /folders)');
    const subFolderResponse = await axios.post(
      `${API_BASE}/folders`,
      { name: '하위 폴더', parentId: newFolderId },
      { headers }
    );
    console.log('✅ 성공:', JSON.stringify(subFolderResponse.data, null, 2));
    const subFolderId = subFolderResponse.data.data._id;
    console.log('');

    // 6. 폴더 이동
    console.log('6️⃣ 폴더 이동 (PUT /:itemId/move)');
    const moveResponse = await axios.put(
      `${API_BASE}/${subFolderId}/move`,
      { targetFolderId: null },  // 루트로 이동
      { headers }
    );
    console.log('✅ 성공:', JSON.stringify(moveResponse.data, null, 2));
    console.log('');

    // 7. 폴더 삭제
    console.log('7️⃣ 폴더 삭제 (DELETE /:itemId)');
    const deleteResponse = await axios.delete(`${API_BASE}/${newFolderId}`, { headers });
    console.log('✅ 성공:', JSON.stringify(deleteResponse.data, null, 2));
    console.log('');

    console.log('🎉 모든 테스트 성공!');

  } catch (error) {
    if (error.response) {
      console.error('❌ 에러:', error.response.status, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ 에러:', error.message);
    }
  }
}

testPersonalFilesAPI();
