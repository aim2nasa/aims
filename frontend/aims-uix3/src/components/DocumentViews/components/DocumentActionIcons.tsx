import type { SVGProps } from 'react'

const baseProps: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg'
}

// 🍎 Eye Icon - 파란색 톤의 세련된 스타일
export const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <defs>
      <linearGradient id="eyeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.2} />
        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.08} />
      </linearGradient>
      <linearGradient id="irisGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.25} />
      </linearGradient>
    </defs>
    {/* 눈 외곽 - 파란색 그라데이션 */}
    <path
      d="M2.5 12C2.5 12 5.5 6 12 6s9.5 6 9.5 6-3 6-9.5 6-9.5-6-9.5-6z"
      fill="url(#eyeGradient)"
    />
    <path
      d="M2.5 12C2.5 12 5.5 6 12 6s9.5 6 9.5 6-3 6-9.5 6-9.5-6-9.5-6z"
      stroke="#3b82f6"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* 홍채 - 파란색 톤 */}
    <circle cx={12} cy={12} r={2.5} fill="url(#irisGradient)" />
    <circle cx={12} cy={12} r={2.5} stroke="#2563eb" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    {/* 동공 */}
    <circle cx={12} cy={12} r={1} fill="#1e40af" opacity={0.4} />
  </svg>
)

// 🍎 Summary Icon - 화려한 멀티 컬러 스타일
export const SummaryIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <defs>
      {/* 첫 번째 라인 - 매우 진한 오렌지 그라데이션 */}
      <linearGradient id="line1Gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ea580c" />
        <stop offset="30%" stopColor="#dc2626" />
        <stop offset="70%" stopColor="#c2410c" />
        <stop offset="100%" stopColor="#9a3412" />
      </linearGradient>
      {/* 두 번째 라인 - 매우 진한 빨강-주황 그라데이션 */}
      <linearGradient id="line2Gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#dc2626" />
        <stop offset="30%" stopColor="#ea580c" />
        <stop offset="70%" stopColor="#c2410c" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
      {/* 세 번째 라인 - 진한 주황 그라데이션 */}
      <linearGradient id="line3Gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#c2410c" />
        <stop offset="50%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#9a3412" />
      </linearGradient>
      {/* 불릿 1 - 매우 진한 오렌지 방사형 */}
      <radialGradient id="bullet1Gradient" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fed7aa" />
        <stop offset="40%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#c2410c" />
      </radialGradient>
      {/* 불릿 2 - 진한 빨강-주황 방사형 */}
      <radialGradient id="bullet2Gradient" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fecaca" />
        <stop offset="40%" stopColor="#dc2626" />
        <stop offset="100%" stopColor="#b91c1c" />
      </radialGradient>
      {/* 불릿 3 - 매우 진한 주황 방사형 */}
      <radialGradient id="bullet3Gradient" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fed7aa" />
        <stop offset="40%" stopColor="#c2410c" />
        <stop offset="100%" stopColor="#9a3412" />
      </radialGradient>
    </defs>

    {/* 첫 번째 리스트 라인 - 배경 글로우 */}
    <path d="M7 7h10" stroke="#ea580c" strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
    <path d="M7 7h10" stroke="url(#line1Gradient)" strokeWidth={1.5} strokeLinecap="round" />

    {/* 두 번째 리스트 라인 - 배경 글로우 */}
    <path d="M7 12h10" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
    <path d="M7 12h10" stroke="url(#line2Gradient)" strokeWidth={1.5} strokeLinecap="round" />

    {/* 세 번째 리스트 라인 - 배경 글로우 */}
    <path d="M7 17h7" stroke="#c2410c" strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
    <path d="M7 17h7" stroke="url(#line3Gradient)" strokeWidth={1.5} strokeLinecap="round" />

    {/* 불릿 포인트 1 - 외곽 글로우 */}
    <circle cx={4.5} cy={7} r={1.4} fill="#ea580c" opacity={0.6} />
    <circle cx={4.5} cy={7} r={0.9} fill="url(#bullet1Gradient)" />
    <circle cx={3.8} cy={6.3} r={0.3} fill="#fed7aa" opacity={0.9} />

    {/* 불릿 포인트 2 - 외곽 글로우 */}
    <circle cx={4.5} cy={12} r={1.4} fill="#dc2626" opacity={0.6} />
    <circle cx={4.5} cy={12} r={0.9} fill="url(#bullet2Gradient)" />
    <circle cx={3.8} cy={11.3} r={0.3} fill="#fecaca" opacity={0.9} />

    {/* 불릿 포인트 3 - 외곽 글로우 */}
    <circle cx={4.5} cy={17} r={1.4} fill="#c2410c" opacity={0.6} />
    <circle cx={4.5} cy={17} r={0.9} fill="url(#bullet3Gradient)" />
    <circle cx={3.8} cy={16.3} r={0.3} fill="#fed7aa" opacity={0.9} />
  </svg>
)

// 🍎 Document Icon - 보라색 톤의 세련된 스타일
export const DocumentIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <defs>
      <linearGradient id="docGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.2} />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.08} />
      </linearGradient>
      <linearGradient id="foldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c4b5fd" stopOpacity={0.4} />
        <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.2} />
      </linearGradient>
    </defs>
    {/* 문서 본체 - 보라색 그라데이션 */}
    <path
      d="M8 3h6l5 5v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
      fill="url(#docGradient)"
    />
    <path
      d="M8 3h6l5 5v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
      stroke="#8b5cf6"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* 페이지 접힘 - 보라색 톤 */}
    <path d="M14 3v5h5" fill="url(#foldGradient)" />
    <path d="M14 3v5h5" stroke="#a78bfa" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    {/* 텍스트 라인 - 보라색 */}
    <path d="M10 13h4" stroke="#a78bfa" strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
    <path d="M10 16h4" stroke="#a78bfa" strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
  </svg>
)

// 🍎 Link Icon - 초록색 톤의 세련된 스타일
export const LinkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...baseProps} {...props}>
    <defs>
      <linearGradient id="linkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="50%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
    {/* 체인 링크 상단 - 초록색 배경 */}
    <path
      d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      stroke="#34d399"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.2}
    />
    <path
      d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      stroke="url(#linkGradient)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* 체인 링크 하단 - 초록색 배경 */}
    <path
      d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      stroke="#34d399"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.2}
    />
    <path
      d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      stroke="url(#linkGradient)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
