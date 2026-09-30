/**
 * CONTENT INPUT CONTRACT — Salmon family presentations (SALMON_FAMILY_PAGE_V1).
 *
 * The React presentation (`SalmonComposer`, `SalmonFamilies`) renders only this model. It never
 * reads a Salmon document, so the repository JSON is not a competing CMS truth: today a
 * transitional adapter (`salmon-family-adapter.ts`) produces the model from the frozen Salmon
 * documents; the runtime Factory's Payload adapter is expected to produce the same model from
 * Payload blocks and media, after which the transitional adapter is deleted.
 *
 * Two kinds of field, deliberately separated:
 *   - CONTENT (editor-editable in Payload): every `RichText`, label, href, `MediaRef`, product
 *     reference, list item, accordion item and anchor id.
 *   - PRESENTATION (code-defined defaults recovered from Salmon, designer-adjustable as block
 *     appearance options, never free CSS): `style`, `layout`, `variant`, `treatment`.
 * Everything is JSON-serialisable. No field carries HTML.
 */

export const SALMON_FAMILY_CONTRACT='SALMON_FAMILY_PAGE_V1' as const
/**
 * Additive revisions within V1 (no field removed or retyped):
 *   1.0.0  R1 — initial contract.
 *   1.1.0  R1.1 — `label` block (non-interactive tag such as a project year); `exclusions` on the
 *          page model (source blocks deliberately withheld from public rendering, with reason and
 *          ruling, so a Payload import applies the same rule); `blue-fade` overlay tone;
 *          button `intent:'quote'`; icon card `iconAfter`.
 */
export const SALMON_FAMILY_CONTRACT_VERSION='1.1.0' as const

export type SalmonFamily='project-portfolio'|'project-detail'|'parts-landing'|'parts-editorial'|'component-class'|'country-service'|'company-capability'|'dry-soda'|'about'|'policy'|'testimonial'

/* ----- content primitives (editor-owned) ----- */
export type RichInline={text:string;bold?:boolean;italic?:boolean;href?:string}
export type RichText=RichInline[]
export type TextBlock=
  |{kind:'paragraph';content:RichText}
  |{kind:'heading';level:2|3|4|5|6;content:RichText}
  |{kind:'bullets'|'numbered';items:RichText[]}
  |{kind:'table';rows:RichText[][]}
  |{kind:'quote';content:RichText}
/** A media library reference. In Payload: an upload relation; `src` is its public URL. */
export type MediaRef={src:string;alt:string;width?:number;height?:number;sha256?:string;sourceUrl?:string}

/* ----- presentation primitives (code-defined) ----- */
export type ColorRole='white'|'ink'|'blue'|'muted'|'soft'
export type Align='start'|'center'|'end'
export type TypeRole={family:'display'|'sans';sizePx?:number;weight?:number;color?:ColorRole;defaultColor?:boolean;transform?:'uppercase'|'capitalize'}
export type AlignStyle={align?:Align;mobileAlign?:Align}
export type ButtonVariant='solid'|'outline'|'glass'|'pill'
export type Panel='soft'|'white'|'blue'|'blue-gradient'|'dark'
/** `blue-fade`: transparent → brand blue (Salmon foreground panels); added in 1.1.0. */
export type Overlay={tone:'blue'|'blue-fade'|'dark'|'light'|'fade';opacity:number}
export type SvgNode={tag:string;attrs:Record<string,string>;children:SvgNode[]}
/** Icons are presentation assets: Salmon source SVG glyphs, or a recovered embedded image. */
export type Icon={kind:'svg';svg:SvgNode;name?:string;disc?:boolean}|{kind:'image';media:MediaRef}
export type FrameStyle={panel?:Panel;radiusPx?:number;widthPct?:number}

/* ----- blocks ----- */
/** `hideOn`: Salmon device visibility (desktop ≥1025px, tablet 768–1024px, mobile ≤767px). */
export type Device='desktop'|'tablet'|'mobile'
type Keyed={key:string;hideOn?:Device[]}
export type HeadingBlock=Keyed&{type:'heading';level:1|2|3|4|5|6;text:RichText;anchorId?:string;style:TypeRole&AlignStyle}
export type TextWidgetBlock=Keyed&{type:'text';blocks:TextBlock[];style:TypeRole&AlignStyle}
/** Non-interactive tag (e.g. a project year). Source buttons without a destination become labels. */
export type LabelBlock=Keyed&{type:'label';text:string;style:AlignStyle}
/** `intent:'quote'` (1.1.0): an explicit quote request; rendered through the approved RFQ adapter, `href` is the fallback. */
export type ButtonBlock=Keyed&{type:'button';label:string;href?:string;variant:ButtonVariant;rfqOnly?:boolean;intent?:'quote';style:AlignStyle}
export type ImageBlock=Keyed&{type:'image';media:MediaRef;style:AlignStyle&{width?:string;radius?:string}}
export type IconCardBlock=Keyed&{type:'iconCard';icon?:Icon;title?:RichText;titleLevel:1|2|3|4|5|6;text?:RichText;href?:string;side:boolean;titleStyle:TypeRole;textStyle:TypeRole;style:AlignStyle&FrameStyle;/** 1.1.0: Salmon `position-block-end` puts the icon after the text. */iconAfter?:boolean}
export type ImageCardBlock=Keyed&{type:'imageCard';media?:MediaRef;title?:RichText;titleLevel:1|2|3|4|5|6;text?:RichText;href?:string;titleStyle:TypeRole;textStyle:TypeRole;style:AlignStyle&FrameStyle&{imageWidth?:string;imageRadius?:string}}
export type ListBlock=Keyed&{type:'list';items:Array<{text:RichText;href?:string;icon?:Icon}>;style:TypeRole}
export type AccordionBlock=Keyed&{type:'accordion';items:Array<{question:string;answer:Block[]}>}
export type AnchorBlock=Keyed&{type:'anchor';id:string}
export type IconLinkBlock=Keyed&{type:'iconLink';href?:string;label:string;icon?:Icon}
/** A product reference; name/media/detail come from the product record, never re-typed. */
export type ProductCardInput={key:string;name:RichText;productPath?:string;productRouteId?:string;media?:MediaRef;detail?:TextBlock[]}
export type ProductGridBlock=Keyed&{type:'productGrid';products:ProductCardInput[];single?:boolean}
export type ContainerLayout={direction:'row'|'column'|'grid';gridColumns?:number;/** Sanitised `fr` track list, e.g. `40fr 60fr`. */gridTemplate?:string;widthPct?:number;align?:Align;mobileAlign?:Align;justify?:'center'|'end';rounded?:boolean;radiusPx?:number;minHeightPx?:number;panel?:Panel;overlay?:Overlay}
/** `background.mode`: `photo` carries text over the image, `backdrop` sits behind child media, `image` is the content itself. */
export type ContainerBlock=Keyed&{type:'container';elementId?:string;layout:ContainerLayout;background?:{media:MediaRef;mode:'photo'|'backdrop'|'image';fit?:'cover'|'contain'|'auto';position?:string};children:Block[]}
export type Block=HeadingBlock|TextWidgetBlock|ButtonBlock|LabelBlock|ImageBlock|IconCardBlock|ImageCardBlock|ListBlock|AccordionBlock|AnchorBlock|IconLinkBlock|ProductGridBlock|ContainerBlock

export type SectionTreatment='hero'|'boxed'|'band'
export type SectionModel={key:string;index:number;elementId?:string;treatment:SectionTreatment;tone?:ColorRole;role?:'related-products';root:ContainerBlock}
export type SalmonFamilyPageModel={
  contract:typeof SALMON_FAMILY_CONTRACT
  contractVersion:typeof SALMON_FAMILY_CONTRACT_VERSION
  family:SalmonFamily
  auditFamily:string
  routeId:string
  path:string
  source:{kind:'SALMON_TRANSITIONAL_JSON'|'PAYLOAD';sha256:string}
  sections:SectionModel[]
  /** Source blocks withheld from public rendering (source archive untouched). */
  exclusions:Array<{elementId:string;sourceKey:string;reason:'UNSUPPORTED_THEME_TESTIMONIAL'|'IMAGE_LABEL_DESCRIPTION_MISMATCH_NO_APPROVED_MAPPING';ruling:string}>
  /** Accepted non-Salmon modules that already existed on these routes (code-defined). */
  modules:{aboutPresence?:boolean;projectCoverage?:Array<{path:string;title:string}>;projectDiscovery?:boolean;projectNavigation?:boolean}
}
