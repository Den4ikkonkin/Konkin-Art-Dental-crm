/* Иконки для центров колец, по образцу: зуб-схема, имплант с коронкой, культя с коронкой. */

type IconProps = { size?: number; color?: string }

/* Контур зуба (общий для всех иконок) */
const TOOTH_PATH =
  'M 130 22 C 176 20 218 36 226 88 C 232 136 214 176 196 210 C 186 232 178 262 160 262 C 146 262 140 232 130 200 C 120 232 114 262 100 262 C 82 262 74 232 64 210 C 46 176 28 136 34 88 C 42 36 84 20 130 22 Z'

/* RingA — зуб-схема с дорожками (как на образце, левый) */
export function CrownToothIcon({ size = 56, color = '#7DD3FC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 260 280" aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round">
        <path d={TOOTH_PATH} />
        <path d="M 74 70 H 120 L 150 92 H 178" strokeWidth={9} />
        <path d="M 58 118 H 96 L 120 140" strokeWidth={9} />
        <path d="M 174 186 L 176 152 L 196 136" strokeWidth={9} />
      </g>
      <circle cx="168" cy="122" r="10" fill={color} />
    </svg>
  )
}

/* RingB — силуэт пациента */
export function PatientIcon({ size = 56, color = '#94A3B8' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="22" r="11" fill={color} />
      <path d="M12 58 C12 42 20 36 32 36 C44 36 52 42 52 58 Z" fill={color} />
    </svg>
  )
}

/* RingC — винтовая фиксация: коронка, пунктир, металлический имплант (как на образце, средний) */
export function ImplantCrownIcon({ size = 56, color = '#7DD3FC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 150" aria-hidden="true">
      <path
        d="M 60 4 C 84 3 104 10 108 30 C 111 46 102 58 98 72 C 94 84 92 96 84 96 C 76 96 74 80 70 64 C 67 52 53 52 50 64 C 46 80 44 96 36 96 C 28 96 26 84 22 72 C 18 58 9 46 12 30 C 16 10 36 3 60 4 Z"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <line x1="60" y1="100" x2="60" y2="118" stroke={color} strokeWidth="3" strokeDasharray="4 4" />
      <rect x="40" y="118" width="40" height="7" rx="2" fill="#B6C4D6" />
      <path d="M 44 125 H 76 L 72 146 H 48 Z" fill="#94A3B8" />
      <path d="M 44 131 H 76 M 45 137 H 75" stroke="#E2E8F0" strokeWidth="2" />
    </svg>
  )
}

/* Культя: коронка над пунктиром, бежевая обточенная культя (как на образце, правый) */
export function StumpCrownIcon({ size = 56, color = '#7DD3FC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 150" aria-hidden="true">
      <path
        d="M 60 4 C 84 3 104 10 108 30 C 111 46 102 58 98 72 C 94 84 92 96 84 96 C 76 96 74 80 70 64 C 67 52 53 52 50 64 C 46 80 44 96 36 96 C 28 96 26 84 22 72 C 18 58 9 46 12 30 C 16 10 36 3 60 4 Z"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <line x1="60" y1="100" x2="60" y2="118" stroke={color} strokeWidth="3" strokeDasharray="4 4" />
      <path d="M 40 118 H 80 V 138 C 80 146 72 148 60 148 C 48 148 40 146 40 138 Z" fill="#EAD7B7" stroke="#D9B98A" strokeWidth="3" />
    </svg>
  )
}
