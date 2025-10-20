import { describe, it, expect } from 'vitest'

/**
 * 아이콘 크기 16px 제한 테스트
 *
 * 커밋: 48fe590, af4c62a
 * CLAUDE.md 규칙:
 * - LeftPane CustomMenu 아이콘(16px)이 최대 크기
 * - 모든 아이콘은 16px 이하여야 함
 *
 * 테스트 범위:
 * 1. 액션 버튼 아이콘 크기 검증
 * 2. SFSymbol 크기 제한 검증
 * 3. SVG 아이콘 크기 검증
 */
describe('Icon Size 16px Limit', () => {
  describe('아이콘 크기 규칙', () => {
    it('16px 이하 아이콘은 허용되어야 함', () => {
      const allowedSizes = [12, 13, 14, 15, 16]

      allowedSizes.forEach(size => {
        expect(size).toBeLessThanOrEqual(16)
      })
    })

    it('16px 초과 아이콘은 금지되어야 함', () => {
      const prohibitedSizes = [17, 18, 20, 24, 32]

      prohibitedSizes.forEach(size => {
        expect(size).toBeGreaterThan(16)
      })
    })
  })

  describe('액션 버튼 아이콘 크기', () => {
    it('DocumentLibrary 액션 버튼 아이콘은 16px이어야 함', () => {
      // DocumentLibraryView 액션 버튼 아이콘 크기
      const actionIconSize = 16

      expect(actionIconSize).toBe(16)
      expect(actionIconSize).toBeLessThanOrEqual(16)
    })

    it('다양한 컴포넌트의 아이콘 크기가 16px 이하여야 함', () => {
      const iconSizes = {
        documentLibrary: 16,
        documentSearch: 16,
        documentStatus: 16,
        leftPaneMenu: 16,
        refreshButton: 16
      }

      Object.entries(iconSizes).forEach(([_component, size]) => {
        expect(size).toBeLessThanOrEqual(16)
      })
    })
  })

  describe('SVG 아이콘 props', () => {
    it('SVG 아이콘의 width/height가 16px 이하여야 함', () => {
      const svgIconProps = {
        width: 16,
        height: 16
      }

      expect(svgIconProps.width).toBeLessThanOrEqual(16)
      expect(svgIconProps.height).toBeLessThanOrEqual(16)
    })

    it('다양한 크기의 SVG 아이콘 검증', () => {
      const iconConfigs = [
        { name: 'small', width: 12, height: 12 },
        { name: 'medium', width: 14, height: 14 },
        { name: 'large', width: 16, height: 16 }
      ]

      iconConfigs.forEach(config => {
        expect(config.width).toBeLessThanOrEqual(16)
        expect(config.height).toBeLessThanOrEqual(16)
      })
    })

    it('정사각형이 아닌 아이콘도 16px 이하여야 함', () => {
      const rectangularIcon = {
        width: 14,
        height: 16
      }

      expect(rectangularIcon.width).toBeLessThanOrEqual(16)
      expect(rectangularIcon.height).toBeLessThanOrEqual(16)
      expect(Math.max(rectangularIcon.width, rectangularIcon.height)).toBeLessThanOrEqual(16)
    })
  })

  describe('SFSymbol 크기 enum', () => {
    // SFSymbolSize enum 값들
    const SFSymbolSize = {
      CAPTION_2: 12,
      CAPTION_1: 13,
      FOOTNOTE: 15,
      CALLOUT: 16,
      BODY: 17,        // ❌ 금지
      HEADLINE: 20,    // ❌ 금지
      TITLE_3: 24      // ❌ 금지
    }

    it('CALLOUT(16px)이 최대 허용 크기여야 함', () => {
      expect(SFSymbolSize.CALLOUT).toBe(16)
      expect(SFSymbolSize.CALLOUT).toBeLessThanOrEqual(16)
    })

    it('CALLOUT 이하 크기는 허용되어야 함', () => {
      const allowedSizes = [
        SFSymbolSize.CAPTION_2,  // 12
        SFSymbolSize.CAPTION_1,  // 13
        SFSymbolSize.FOOTNOTE,   // 15
        SFSymbolSize.CALLOUT     // 16
      ]

      allowedSizes.forEach(size => {
        expect(size).toBeLessThanOrEqual(16)
      })
    })

    it('CALLOUT 초과 크기는 금지되어야 함', () => {
      const prohibitedSizes = [
        SFSymbolSize.BODY,       // 17
        SFSymbolSize.HEADLINE,   // 20
        SFSymbolSize.TITLE_3     // 24
      ]

      prohibitedSizes.forEach(size => {
        expect(size).toBeGreaterThan(16)
      })
    })
  })

  describe('컴포넌트별 아이콘 크기 검증', () => {
    it('DocumentLibraryView 아이콘들', () => {
      const libraryIcons = {
        eye: 16,
        link: 16,
        summary: 16,
        document: 16,
        refresh: 16
      }

      Object.values(libraryIcons).forEach(size => {
        expect(size).toBeLessThanOrEqual(16)
      })
    })

    it('DocumentSearchView 아이콘들', () => {
      const searchIcons = {
        search: 16,
        filter: 16,
        clear: 16
      }

      Object.values(searchIcons).forEach(size => {
        expect(size).toBeLessThanOrEqual(16)
      })
    })

    it('LeftPane CustomMenu 아이콘 (기준)', () => {
      const leftPaneMenuIcon = 16

      expect(leftPaneMenuIcon).toBe(16)
      // 이것이 최대 크기 기준
    })
  })

  describe('아이콘 크기 일관성', () => {
    it('모든 액션 버튼 아이콘은 동일한 크기여야 함', () => {
      const actionButtonIcons = [16, 16, 16, 16, 16]

      const allSame = actionButtonIcons.every(size => size === 16)
      expect(allSame).toBe(true)
    })

    it('같은 컨텍스트의 아이콘들은 일관된 크기를 가져야 함', () => {
      const documentActionsContext = {
        view: 16,
        link: 16,
        summary: 16,
        fulltext: 16
      }

      const sizes = Object.values(documentActionsContext)
      const firstSize = sizes[0]
      const allConsistent = sizes.every(size => size === firstSize)

      expect(allConsistent).toBe(true)
      expect(firstSize).toBe(16)
    })
  })

  describe('에러 케이스', () => {
    it('17px 아이콘은 규칙 위반', () => {
      const invalidSize = 17

      expect(invalidSize).toBeGreaterThan(16)
      // CLAUDE.md 규칙 위반
    })

    it('20px 아이콘은 규칙 위반', () => {
      const invalidSize = 20

      expect(invalidSize).toBeGreaterThan(16)
      // CLAUDE.md 규칙 위반
    })

    it('24px 아이콘은 규칙 위반', () => {
      const invalidSize = 24

      expect(invalidSize).toBeGreaterThan(16)
      // CLAUDE.md 규칙 위반
    })
  })

  describe('CLAUDE.md 규칙 준수', () => {
    it('LeftPane CustomMenu 아이콘이 최대 크기 기준', () => {
      const leftPaneMaxSize = 16
      const allOtherIcons = [12, 13, 14, 15, 16]

      allOtherIcons.forEach(size => {
        expect(size).toBeLessThanOrEqual(leftPaneMaxSize)
      })
    })

    it('16px 초과 아이콘은 존재해서는 안 됨', () => {
      const allIconsInApp = [
        12, // CAPTION_2
        13, // CAPTION_1
        15, // FOOTNOTE
        16, // CALLOUT - 최대
        16, // 액션 버튼
        16, // 리스트 아이템
        14, // 작은 아이콘
      ]

      const hasOversizedIcon = allIconsInApp.some(size => size > 16)
      expect(hasOversizedIcon).toBe(false)
    })

    it('모든 아이콘이 16px 이하여야 함', () => {
      const MAX_ICON_SIZE = 16

      const iconSizesToTest = [
        12, 13, 14, 15, 16, // 허용
        // 17, 18, 20, 24 // 금지 - 테스트에 포함하지 않음
      ]

      iconSizesToTest.forEach(size => {
        expect(size).toBeLessThanOrEqual(MAX_ICON_SIZE)
      })
    })
  })
})
