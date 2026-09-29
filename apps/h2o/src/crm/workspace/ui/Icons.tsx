/* One outline icon set, 1.5px stroke, currentColor. Decorative unless a label is passed. */
type P = { label?: string }
const Svg = ({ label, children }: P & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={label ? undefined : true}
    role={label ? 'img' : undefined}
    aria-label={label}
    focusable="false"
  >
    {label ? <title>{label}</title> : null}
    {children}
  </svg>
)

export const IconWork = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v14H4z" />
    <path d="M4 10h16M9 5v5" />
  </Svg>
)
export const IconInbox = (p: P) => (
  <Svg {...p}>
    <path d="M4 13l2.5-7h11L20 13v6H4z" />
    <path d="M4 13h5l1 2h4l1-2h5" />
  </Svg>
)
export const IconTasks = (p: P) => (
  <Svg {...p}>
    <path d="M5 5h14v14H5z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </Svg>
)
export const IconPipeline = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h11M4 18h6" />
  </Svg>
)
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Svg>
)
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconUrgent = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
)
export const IconReview = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="3" />
    <circle cx="16" cy="10" r="2.5" />
    <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M14.5 15.2c2.3-.3 4.4.9 5.5 3.8" />
  </Svg>
)
export const IconDoNotContact = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M6.5 6.5l11 11" />
  </Svg>
)
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
)
