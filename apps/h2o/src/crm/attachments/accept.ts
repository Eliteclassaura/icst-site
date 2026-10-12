import { attachmentLimits } from './validate'

/** The file picker's filter and the limit line (the server checks every file again; this only helps the person choose). */
export const ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.zip,.dwg,.dxf'

export function limitLabel(env: Record<string, string | undefined>): string {
  const { maxBytes, maxPerRecord } = attachmentLimits(env)
  return `PDF, Word, Excel, CSV, text, PNG, JPG, WEBP, ZIP, DWG or DXF. Up to ${Math.round(maxBytes / (1024 * 1024))} MB each, ${maxPerRecord} per record.`
}
