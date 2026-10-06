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
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const IconAccounts = (p: P) => (
  <Svg {...p}>
    <path d="M4 20V8l6-3v15M10 20V10l10 3v7M4 20h16" />
    <path d="M13 15h1M16 15h1M13 17.5h1M16 17.5h1" />
  </Svg>
)
export const IconContacts = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="3.5" />
    <path d="M5 19.5c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" />
  </Svg>
)
export const IconMore = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={2.5} />
  </Svg>
)
/* Patch C: settings (a sliders glyph). */
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
)

/* Polish R1: inquiry types (Parts · New tower · Repair / service), status tones, reply clock, sheet controls. */
export const IconPart = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const IconTower = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h10M8 20h8M7 4c1.6 4 1.6 6-1 16M17 4c-1.6 4-1.6 6 1 16" />
    <path d="M10 2.5c.5.5.5 1 0 1.5M14 2.5c.5.5.5 1 0 1.5" />
  </Svg>
)
export const IconWrench = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.1 2.1 0 0 1-3-3l8-8a4 4 0 0 0-2-2z" />
    <path d="M14.5 6.5l2-2 3 3-2 2" />
  </Svg>
)
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.5M12 15.5h.01" />
  </Svg>
)
export const IconCircleDot = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
)
export const IconProgress = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconCheckCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
  </Svg>
)
export const IconMinusCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M8.5 12h7" />
  </Svg>
)
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M6 20V4.5M6 5h11l-2.5 4L17 13H6" />
  </Svg>
)
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
)
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Svg>
)
export const IconFilter = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
)
export const IconRows = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </Svg>
)
