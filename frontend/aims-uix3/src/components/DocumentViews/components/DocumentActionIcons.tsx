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
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

export const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path
      d="M2.25 12s3.25-6 9.75-6 9.75 6 9.75 6-3.25 6-9.75 6-9.75-6-9.75-6z"
      {...strokeProps}
    />
    <circle cx={12} cy={12} r={3.25} {...strokeProps} />
  </svg>
)

export const SummaryIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path d="M6.5 7.5h11" {...strokeProps} />
    <path d="M6.5 12h11" {...strokeProps} />
    <path d="M6.5 16.5H14" {...strokeProps} />
    <circle cx={4.75} cy={7.5} r={0.9} fill="currentColor" />
    <circle cx={4.75} cy={12} r={0.9} fill="currentColor" />
    <circle cx={4.75} cy={16.5} r={0.9} fill="currentColor" />
  </svg>
)

export const DocumentIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path
      d="M8.25 3h5.25L19.5 9v10.5a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 8.25 3z"
      {...strokeProps}
    />
    <path d="M13.5 3v5.25H19.5" {...strokeProps} />
    <path d="M9.75 12h4.5" {...strokeProps} />
    <path d="M9.75 15.75h4.5" {...strokeProps} />
  </svg>
)

export const LinkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <path
      d="M9.75 14.25 6.5 17.5a3 3 0 0 1-4.25-4.25l3.25-3.25"
      {...strokeProps}
    />
    <path
      d="M14.25 9.75 17.5 6.5a3 3 0 0 1 4.25 4.25l-3.25 3.25"
      {...strokeProps}
    />
    <path d="M9 15c3 3 6 3 9 0" {...strokeProps} />
  </svg>
)
