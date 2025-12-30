#!/usr/bin/env node
/**
 * 문의 첨부파일 마이그레이션 스크립트
 *
 * 변경 전: /data/files/inquiries/[inquiryId]/파일들
 * 변경 후: /data/files/users/[userId]/inquiries/[inquiryId]/파일들
 *
 * 사용법:
 *   node migrate-inquiry-files.js [--dry-run]
 *
 * --dry-run: 실제 이동 없이 미리보기만 수행
 */

const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');

// 설정
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/docupload';
const OLD_BASE_PATH = '/data/files/inquiries';
const NEW_BASE_PATH = '/data/files/users';

const isDryRun = process.argv.includes('--dry-run');

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function moveDirectory(src, dest) {
  // 대상 디렉토리 생성
  await ensureDirectoryExists(dest);

  // 파일 목록 읽기
  const files = await fs.readdir(src);

  for (const file of files) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);

    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      // 하위 디렉토리 재귀 처리
      await moveDirectory(srcPath, destPath);
    } else {
      // 파일 이동
      await fs.rename(srcPath, destPath);
      console.log(`  이동: ${file}`);
    }
  }

  // 빈 소스 디렉토리 삭제
  const remaining = await fs.readdir(src);
  if (remaining.length === 0) {
    await fs.rmdir(src);
  }
}

async function main() {
  console.log('========================================');
  console.log('문의 첨부파일 마이그레이션 스크립트');
  console.log('========================================');
  console.log(`모드: ${isDryRun ? 'DRY RUN (미리보기)' : '실제 마이그레이션'}`);
  console.log(`이전 경로: ${OLD_BASE_PATH}`);
  console.log(`새 경로: ${NEW_BASE_PATH}/[userId]/inquiries/[inquiryId]`);
  console.log('');

  // MongoDB 연결
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('MongoDB 연결 성공');

    const db = client.db();
    const inquiriesCollection = db.collection('inquiries');

    // 기존 inquiries 폴더 존재 확인
    let oldDirExists = false;
    try {
      await fs.access(OLD_BASE_PATH);
      oldDirExists = true;
    } catch {
      console.log(`\n기존 폴더가 없습니다: ${OLD_BASE_PATH}`);
      console.log('마이그레이션할 파일이 없습니다.');
      return;
    }

    // inquiryId 폴더 목록 읽기
    const entries = await fs.readdir(OLD_BASE_PATH, { withFileTypes: true });
    const inquiryDirs = entries.filter(e => e.isDirectory() && e.name !== 'temp');

    console.log(`\n발견된 문의 폴더: ${inquiryDirs.length}개`);

    if (inquiryDirs.length === 0) {
      console.log('마이그레이션할 문의 폴더가 없습니다.');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (const dir of inquiryDirs) {
      const inquiryId = dir.name;
      console.log(`\n[${inquiryId}] 처리 중...`);

      // MongoDB에서 문의 조회
      let inquiry;
      try {
        inquiry = await inquiriesCollection.findOne({ _id: new ObjectId(inquiryId) });
      } catch (e) {
        console.log(`  [오류] 유효하지 않은 ObjectId: ${inquiryId}`);
        failCount++;
        results.push({ inquiryId, status: 'error', reason: '유효하지 않은 ObjectId' });
        continue;
      }

      if (!inquiry) {
        console.log(`  [오류] 문의를 찾을 수 없음: ${inquiryId}`);
        failCount++;
        results.push({ inquiryId, status: 'error', reason: '문의 없음' });
        continue;
      }

      const userId = inquiry.userId.toString();
      console.log(`  사용자 ID: ${userId}`);

      const oldPath = path.join(OLD_BASE_PATH, inquiryId);
      const newPath = path.join(NEW_BASE_PATH, userId, 'inquiries', inquiryId);

      console.log(`  이전: ${oldPath}`);
      console.log(`  이후: ${newPath}`);

      // 파일 목록 확인
      const files = await fs.readdir(oldPath);
      console.log(`  파일 수: ${files.length}개`);

      if (isDryRun) {
        console.log('  [DRY RUN] 이동 건너뜀');
        successCount++;
        results.push({ inquiryId, userId, oldPath, newPath, fileCount: files.length, status: 'dry-run' });
      } else {
        try {
          await moveDirectory(oldPath, newPath);
          console.log('  [성공] 이동 완료');
          successCount++;
          results.push({ inquiryId, userId, oldPath, newPath, fileCount: files.length, status: 'success' });
        } catch (e) {
          console.log(`  [오류] 이동 실패: ${e.message}`);
          failCount++;
          results.push({ inquiryId, userId, status: 'error', reason: e.message });
        }
      }
    }

    // temp 폴더 처리
    const tempPath = path.join(OLD_BASE_PATH, 'temp');
    try {
      await fs.access(tempPath);
      const tempFiles = await fs.readdir(tempPath);
      if (tempFiles.length === 0 && !isDryRun) {
        await fs.rmdir(tempPath);
        console.log('\n빈 temp 폴더 삭제됨');
      } else if (tempFiles.length > 0) {
        console.log(`\n[주의] temp 폴더에 ${tempFiles.length}개 파일이 남아있음`);
      }
    } catch {
      // temp 폴더 없음
    }

    // 결과 요약
    console.log('\n========================================');
    console.log('마이그레이션 결과');
    console.log('========================================');
    console.log(`성공: ${successCount}개`);
    console.log(`실패: ${failCount}개`);

    if (failCount > 0) {
      console.log('\n실패한 항목:');
      results.filter(r => r.status === 'error').forEach(r => {
        console.log(`  - ${r.inquiryId}: ${r.reason}`);
      });
    }

    // 기존 폴더가 비어있으면 삭제
    if (!isDryRun) {
      try {
        const remaining = await fs.readdir(OLD_BASE_PATH);
        if (remaining.length === 0) {
          await fs.rmdir(OLD_BASE_PATH);
          console.log(`\n기존 폴더 삭제됨: ${OLD_BASE_PATH}`);
        } else {
          console.log(`\n[주의] 기존 폴더에 ${remaining.length}개 항목이 남아있음`);
        }
      } catch (e) {
        // 무시
      }
    }

  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nMongoDB 연결 종료');
  }
}

main().catch(console.error);
