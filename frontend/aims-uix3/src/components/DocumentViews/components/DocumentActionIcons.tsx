import type { SVGProps } from 'react'

const baseProps: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg'
}

const strokeProps = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

// 🍎 Eye Icon - SF Symbols 스타일의 부드러운 곡선
export const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path
      d="M2.5 12C2.5 12 5.5 6 12 6s9.5 6 9.5 6-3 6-9.5 6-9.5-6-9.5-6z"
      {...strokeProps}
    />
    <circle cx={12} cy={12} r={2.5} {...strokeProps} />
    <circle cx={12} cy={12} r={1} fill="currentColor" opacity={0.3} />
  </svg>
)

// 🍎 Summary Icon - 세련된 리스트 스타일
export const SummaryIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path d="M7 7h10" {...strokeProps} />
    <path d="M7 12h10" {...strokeProps} />
    <path d="M7 17h7" {...strokeProps} />
    <circle cx={4.5} cy={7} r={0.75} fill="currentColor" />
    <circle cx={4.5} cy={12} r={0.75} fill="currentColor" />
    <circle cx={4.5} cy={17} r={0.75} fill="currentColor" />
  </svg>
)

// 🍎 Document Icon - 우아한 문서 아이콘
export const DocumentIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path
      d="M8 3h6l5 5v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
      {...strokeProps}
    />
    <path d="M14 3v5h5" {...strokeProps} />
    <path d="M10 13h4" {...strokeProps} strokeWidth={1.5} />
    <path d="M10 16h4" {...strokeProps} strokeWidth={1.5} />
  </svg>
)

// 🍎 Link Icon - 매끄러운 체인 링크
export const LinkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path
      d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      {...strokeProps}
    />
    <path
      d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      {...strokeProps}
    />
  </svg>
)
