/**
 * virusScanApi 테스트
 * @since 2025-12-13
 *
 * 참고: scanFile, scanFiles는 실제 API 호출이 필요하므로
 * 여기서는 유틸리티 함수들만 테스트합니다.
 * API 호출 테스트는 통합 테스트에서 수행합니다.
 */

import { describe, it, expect } from 'vitest'
import {
  getInfectedFiles,
  getScanSummary,
} from '../virusScanUtils'
import type { VirusScanResult } from '../types'

describe('virusScanApi', () => {
  describe('getInfectedFiles', () => {
    it('감염된 파일 필터링', () => {
      const file1 = new File([''], 'clean.pdf')
      const file2 = new File([''], 'infected.exe')
      const file3 = new File([''], 'also-clean.doc')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: true, infected: false }],
        [file2, { scanned: true, infected: true, virusName: 'Trojan.Test' }],
        [file3, { scanned: true, infected: false }],
      ])

      const infected = getInfectedFiles(results)

      expect(infected).toHaveLength(1)
      expect(infected[0].name).toBe('infected.exe')
    })

    it('감염 파일 없으면 빈 배열', () => {
      const file1 = new File([''], 'clean.pdf')
      const file2 = new File([''], 'also-clean.doc')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: true, infected: false }],
        [file2, { scanned: true, infected: false }],
      ])

      const infected = getInfectedFiles(results)
      expect(infected).toHaveLength(0)
    })

    it('빈 Map에서 빈 배열 반환', () => {
      const results = new Map<File, VirusScanResult>()
      const infected = getInfectedFiles(results)
      expect(infected).toHaveLength(0)
    })

    it('여러 감염 파일 모두 반환', () => {
      const file1 = new File([''], 'virus1.exe')
      const file2 = new File([''], 'virus2.bat')
      const file3 = new File([''], 'clean.pdf')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: true, infected: true, virusName: 'Trojan.A' }],
        [file2, { scanned: true, infected: true, virusName: 'Trojan.B' }],
        [file3, { scanned: true, infected: false }],
      ])

      const infected = getInfectedFiles(results)

      expect(infected).toHaveLength(2)
      expect(infected.map(f => f.name)).toContain('virus1.exe')
      expect(infected.map(f => f.name)).toContain('virus2.bat')
    })
  })

  describe('getScanSummary', () => {
    it('스캔 결과 요약 생성', () => {
      const file1 = new File([''], 'scanned1.pdf')
      const file2 = new File([''], 'infected.exe')
      const file3 = new File([''], 'skipped.pdf')
      const file4 = new File([''], 'error.pdf')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: true, infected: false }],
        [file2, { scanned: true, infected: true, virusName: 'Virus.Test' }],
        [file3, { scanned: false, infected: false, skipped: true }],
        [file4, { scanned: false, infected: false, error: 'Scan failed' }],
      ])

      const summary = getScanSummary(results)

      expect(summary.total).toBe(4)
      expect(summary.scanned).toBe(2)
      expect(summary.infected).toBe(1)
      expect(summary.skipped).toBe(1)
      expect(summary.errors).toBe(1)
    })

    it('빈 결과', () => {
      const results = new Map<File, VirusScanResult>()
      const summary = getScanSummary(results)

      expect(summary.total).toBe(0)
      expect(summary.scanned).toBe(0)
      expect(summary.infected).toBe(0)
      expect(summary.skipped).toBe(0)
      expect(summary.errors).toBe(0)
    })

    it('모두 클린한 경우', () => {
      const file1 = new File([''], 'clean1.pdf')
      const file2 = new File([''], 'clean2.doc')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: true, infected: false }],
        [file2, { scanned: true, infected: false }],
      ])

      const summary = getScanSummary(results)

      expect(summary.total).toBe(2)
      expect(summary.scanned).toBe(2)
      expect(summary.infected).toBe(0)
      expect(summary.skipped).toBe(0)
      expect(summary.errors).toBe(0)
    })

    it('모두 스킵된 경우', () => {
      const file1 = new File([''], 'skip1.pdf')
      const file2 = new File([''], 'skip2.doc')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: false, infected: false, skipped: true }],
        [file2, { scanned: false, infected: false, skipped: true, message: 'ClamAV disabled' }],
      ])

      const summary = getScanSummary(results)

      expect(summary.total).toBe(2)
      expect(summary.scanned).toBe(0)
      expect(summary.infected).toBe(0)
      expect(summary.skipped).toBe(2)
      expect(summary.errors).toBe(0)
    })

    it('모두 감염된 경우', () => {
      const file1 = new File([''], 'virus1.exe')
      const file2 = new File([''], 'virus2.bat')

      const results = new Map<File, VirusScanResult>([
        [file1, { scanned: true, infected: true, virusName: 'Trojan.A' }],
        [file2, { scanned: true, infected: true, virusName: 'Worm.B' }],
      ])

      const summary = getScanSummary(results)

      expect(summary.total).toBe(2)
      expect(summary.scanned).toBe(2)
      expect(summary.infected).toBe(2)
      expect(summary.skipped).toBe(0)
      expect(summary.errors).toBe(0)
    })

    it('복합 시나리오', () => {
      const files = [
        new File([''], 'clean1.pdf'),
        new File([''], 'clean2.doc'),
        new File([''], 'infected.exe'),
        new File([''], 'skipped1.pdf'),
        new File([''], 'skipped2.doc'),
        new File([''], 'error.pdf'),
      ]

      const results = new Map<File, VirusScanResult>([
        [files[0], { scanned: true, infected: false }],
        [files[1], { scanned: true, infected: false }],
        [files[2], { scanned: true, infected: true, virusName: 'Trojan.Test' }],
        [files[3], { scanned: false, infected: false, skipped: true }],
        [files[4], { scanned: false, infected: false, skipped: true }],
        [files[5], { scanned: false, infected: false, error: 'Timeout' }],
      ])

      const summary = getScanSummary(results)

      expect(summary.total).toBe(6)
      expect(summary.scanned).toBe(3)
      expect(summary.infected).toBe(1)
      expect(summary.skipped).toBe(2)
      expect(summary.errors).toBe(1)
    })
  })
})
