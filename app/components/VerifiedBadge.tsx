interface Props {
  size?: 'sm' | 'md'
  source?: string
}

export default function VerifiedBadge({ size = 'sm', source }: Props) {
  const dim = size === 'md' ? 'w-5 h-5' : 'w-4 h-4'
  const icon = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5'
  const title = source ? `Da xac minh tren ${source}` : 'Token da xac minh'

  return (
    <div
      className={`${dim} bg-mp-primary rounded-full flex items-center justify-center shrink-0`}
      title={title}
    >
      <svg
        className={`${icon} text-white`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}
