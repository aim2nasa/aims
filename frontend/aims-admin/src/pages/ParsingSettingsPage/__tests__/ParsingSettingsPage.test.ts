/**
 * ParsingSettingsPage regression test (#8)
 * - summarize 모델 드롭다운이 백엔드 미배포 시에도 기본값 표시
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../ParsingSettingsPage.tsx'),
  'utf-8'
);

describe('ParsingSettingsPage - summarize model fallback', () => {
  it('has summarize section', () => {
    expect(src).toContain('문서 요약/분류');
    expect(src).toContain('handleSummarizeModelChange');
  });

  it('has fallback for empty availableModels', () => {
    // summarize.availableModels가 없을 때 fallback이 있어야 함
    expect(src).toMatch(/summarize\?\.availableModels\s*\|\|/);
  });

  it('includes gpt-4o-mini as hardcoded fallback', () => {
    expect(src).toContain("'gpt-4o-mini'");
  });
});
