/**
 * QuickSearch + Button responsive CSS regression test
 * - iOS 자동줌 방지: 터치 기기에서 input font-size >= 16px
 * - sm 버튼 터치 타겟: pointer:coarse에서 ::after 44px
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('QuickSearch CSS - iOS zoom prevention', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../QuickSearch.css'),
    'utf-8'
  );

  it('has pointer:coarse media query for input font-size', () => {
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toMatch(/pointer:\s*coarse[\s\S]*?quick-search__input[\s\S]*?font-size:\s*max\(/);
  });

  it('ensures minimum 16px on touch devices', () => {
    expect(css).toMatch(/font-size:\s*max\(.*16px\)/);
  });
});

describe('Button CSS - touch target expansion', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../../../shared/ui/Button.css'),
    'utf-8'
  );

  it('has pointer:coarse media query for sm button', () => {
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toMatch(/pointer:\s*coarse[\s\S]*?button--sm/);
  });

  it('uses ::after pseudo-element for 44px touch zone', () => {
    expect(css).toMatch(/button--sm::after/);
    expect(css).toMatch(/min-width:\s*44px/);
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
