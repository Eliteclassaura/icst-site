import './admin-brand.css'
import { ADMIN_BRAND_ALT, ADMIN_EMBLEM, ADMIN_LOGO } from './admin-brand'

/** Login-screen logo (Payload `admin.components.graphics.Logo`). Light and dark variants follow the admin theme in CSS. */
export function AdminLogo() {
  return (
    <span className="h2o-admin-logo">
      <img className="h2o-admin-logo__light" src={ADMIN_LOGO.light} width={240} height={61} alt={ADMIN_BRAND_ALT} decoding="async" />
      <img className="h2o-admin-logo__dark" src={ADMIN_LOGO.dark} width={240} height={61} alt={ADMIN_BRAND_ALT} decoding="async" />
    </span>
  )
}

/** Admin nav icon (Payload `admin.components.graphics.Icon`): the ICS emblem. */
export function AdminIcon() {
  return <img className="h2o-admin-icon" src={ADMIN_EMBLEM.src} width={28} height={28} alt={ADMIN_BRAND_ALT} decoding="async" />
}
