import React from 'react'
export const metadata = { title: 'C0 spike' }
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>)
}
