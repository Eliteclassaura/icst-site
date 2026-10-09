// PDF-NEWTAB: every link to a PDF opens in a new tab. One shared rule so each link renderer (Salmon, R4/R5, library, rich text) inherits it.
export const isPdfHref=(href:string|null|undefined):boolean=>/\.pdf(?:[?#]|$)/i.test(href??'')
export const PDF_LINK_PROPS={target:'_blank',rel:'noopener noreferrer'} as const
export const pdfLinkProps=(href:string|null|undefined):{target?:'_blank',rel?:string}=>isPdfHref(href)?{...PDF_LINK_PROPS}:{}
