import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.env.BASE ?? 'http://127.0.0.1:3100'
const out = process.env.OUT
if (out === undefined) throw new Error('OUT is required')
const onlyViewport = process.env.ONLY_VIEWPORT

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

const surfaces = [
  { id: 'home', route: '/', surface: 'homepage' },
  { id: 'maintenance-article', route: '/cooling-tower-maintenance/', surface: 'article' },
  { id: 'upgrades', route: '/cooling-tower-thermal-upgrade/', surface: 'upgrades' },
  { id: 'parts', route: '/cooling-tower-parts-online/', surface: 'parts' },
  { id: 'about', route: '/about-ics-industrial-cooling-solutions/', surface: 'about' },
  { id: 'article', route: '/crossflow-vs-counterflow-cooling-tower-2/', surface: 'article' },
  { id: 'contact', route: '/contact-us/', surface: 'contact-rfq' },
  { id: 'resources', route: '/resources/', surface: 'resources' },
]

const capabilityNames = ['construction', 'service', 'parts']
const capabilitySources = ['/media/cohort/7026.png', '/media/cohort/7044.png', '/media/cohort/19970.jpeg']

const waitForCapabilityImages = async (page) =>
  page.locator('.home-cap .cap-media img').evaluateAll(async (images) =>
    Promise.all(
      images.map(async (image) => {
        if (!image.complete || image.naturalWidth === 0) {
          await new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', () => reject(new Error(`failed to load ${image.currentSrc}`)), {
              once: true,
            })
          })
        }
        await image.decode()
      }),
    ),
  )

const browser = await chromium.launch({ headless: true })
const report = { base, issues: [], routes: [], viewports: viewports.map(({ name }) => name) }

for (const viewport of viewports.filter((entry) => onlyViewport === undefined || entry.name === onlyViewport)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.route('**', async (route, request) => {
    const host = new URL(request.url()).host
    if (host === new URL(base).host || request.url().startsWith('data:')) return route.continue()
    return route.abort()
  })
  const folder = path.join(out, viewport.name)
  mkdirSync(folder, { recursive: true })

  for (const { id, route, surface } of surfaces) {
    const page = await context.newPage()
    const capabilityResponses = new Map()
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname
      if (capabilitySources.includes(pathname)) capabilityResponses.set(pathname, response.status())
    })
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45_000 })
    if (id === 'home') await waitForCapabilityImages(page)
    const capabilityRequests =
      id === 'home'
        ? capabilitySources.map((src) => ({ ok: capabilityResponses.get(src) === 200, src, status: capabilityResponses.get(src) ?? 0 }))
        : null
    const metrics = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      mobileRfq: (() => {
        const bar = document.querySelector('.mobile-rfq-bar')
        const control = bar?.querySelector('.rfq a')
        const containerVisible = bar !== null && getComputedStyle(bar).display !== 'none'
        const controlVisible =
          control !== null &&
          getComputedStyle(control).display !== 'none' &&
          control.getBoundingClientRect().width > 0 &&
          control.getBoundingClientRect().height > 0
        return {
          containerExists: bar !== null,
          containerVisible,
          controlVisible,
          emptyBarVisible: containerVisible && !controlVisible,
          state: controlVisible
            ? 'MOBILE_RFQ_CONTROL_VISIBLE'
            : containerVisible
              ? 'MOBILE_RFQ_EMPTY_BAR'
              : 'MOBILE_RFQ_UNAVAILABLE_FAIL_CLOSED',
        }
      })(),
      menuIconVisible: (() => {
        const button = document.querySelector('.nav-button')
        const bars = document.querySelector('.nav-bars')
        if (button === null || bars === null) return false
        const buttonBox = button.getBoundingClientRect()
        const barsBox = bars.getBoundingClientRect()
        return (
          getComputedStyle(bars).display !== 'none' &&
          barsBox.width >= 16 &&
          barsBox.height >= 2 &&
          buttonBox.width >= 48 &&
          buttonBox.height >= 48
        )
      })(),
      mobileArticleIndex: (() => {
        const index = document.querySelector('details.article-index--mobile')
        if (index === null) return null
        return { exists: true, open: index.hasAttribute('open') }
      })(),
      brandedEditorialCards: (() => {
        const cards = [...document.querySelectorAll('.article-displaced-branded-card')]
        return { count: cards.length, maxWidth: Math.max(0, ...cards.map((card) => card.getBoundingClientRect().width)) }
      })(),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      visibleLauncher: (() => {
        const launcher = document.querySelector('[data-testid="floating-quote-launcher"]')
        return launcher !== null && getComputedStyle(launcher).display !== 'none'
      })(),
      capabilityMedia:
        document.querySelectorAll('.home-cap .cap-media img').length === 0
          ? null
          : [...document.querySelectorAll('.home-cap .cap-media img')].map((image) => {
              const frame = image.closest('.feature-frame')
              const imageBox = image.getBoundingClientRect()
              const frameBox = frame?.getBoundingClientRect()
              const overlapWidth =
                frameBox === undefined
                  ? 0
                  : Math.max(0, Math.min(imageBox.right, frameBox.right) - Math.max(imageBox.left, frameBox.left))
              const overlapHeight =
                frameBox === undefined
                  ? 0
                  : Math.max(0, Math.min(imageBox.bottom, frameBox.bottom) - Math.max(imageBox.top, frameBox.top))
              return {
                complete: image.complete,
                frameHeight: frameBox?.height ?? 0,
                frameWidth: frameBox?.width ?? 0,
                naturalHeight: image.naturalHeight,
                naturalWidth: image.naturalWidth,
                paintedWidth: overlapWidth,
                paintedHeight: overlapHeight,
                renderedImageHeight: imageBox.height,
                renderedImageWidth: imageBox.width,
                src: image.getAttribute('src'),
              }
            }),
      ownerAuthority: {
        contactOffices: [...document.querySelectorAll('.contact-directory--footer .contact-office')].map((office) => ({
          label: office.querySelector('strong')?.textContent?.trim() ?? '',
          telephoneHref: office.querySelector('a')?.getAttribute('href') ?? '',
        })),
        footerDirectoryVisible: (() => {
          const directory = document.querySelector('.contact-directory--footer')
          const box = directory?.getBoundingClientRect()
          return box !== undefined && box.width > 0 && box.height > 0
        })(),
        pageDirectoryVisible: (() => {
          const directory = document.querySelector('.contact-directory--page')
          const box = directory?.getBoundingClientRect()
          return box !== undefined && box.width > 0 && box.height > 0
        })(),
        testimonials: {
          feature: document.querySelectorAll('.testimonial-feature').length,
          rows: document.querySelectorAll('.testimonial-row').length,
        },
      },
    }))
    report.routes.push({ id, route, status: response?.status() ?? 0, surface, viewport: viewport.name, capabilityRequests, ...metrics })
    if (metrics.overflow) report.issues.push(`${viewport.name} ${route}: horizontal overflow`)
    if (metrics.h1 !== 1) report.issues.push(`${viewport.name} ${route}: h1 count ${metrics.h1}`)
    if (metrics.visibleLauncher) report.issues.push(`${viewport.name} ${route}: legacy launcher visible`)
    if (viewport.width <= 1024 && !metrics.menuIconVisible)
      report.issues.push(`${viewport.name} ${route}: menu icon is not visibly rendered`)
    if (viewport.width <= 600 && metrics.mobileRfq.emptyBarVisible)
      report.issues.push(`${viewport.name} ${route}: mobile RFQ bar is visible without a control`)
    if (viewport.width <= 768 && metrics.mobileArticleIndex?.open)
      report.issues.push(`${viewport.name} ${route}: mobile article index defaults open`)
    if (metrics.brandedEditorialCards.maxWidth > 401)
      report.issues.push(`${viewport.name} ${route}: branded editorial card exceeds 400px`)
    if (metrics.capabilityMedia !== null) {
      for (const [index, media] of metrics.capabilityMedia.entries()) {
        if (!media.complete || media.naturalWidth <= 0 || media.naturalHeight <= 0)
          report.issues.push(`${viewport.name} ${route}: capability ${index + 1} did not decode`)
        if (media.frameWidth <= 0 || media.frameHeight <= 0)
          report.issues.push(`${viewport.name} ${route}: capability ${index + 1} has a zero-sized frame`)
        if (media.paintedWidth <= 0 || media.paintedHeight <= 0)
          report.issues.push(`${viewport.name} ${route}: capability ${index + 1} does not intersect its frame`)
        if (media.renderedImageWidth > media.naturalWidth + 1 || media.renderedImageHeight > media.naturalHeight + 1)
          report.issues.push(`${viewport.name} ${route}: capability ${index + 1} renders above its native size`)
      }
    }
    if (metrics.ownerAuthority.contactOffices.length !== 3 || !metrics.ownerAuthority.footerDirectoryVisible)
      report.issues.push(`${viewport.name} ${route}: owner-authorized footer contact directory is incomplete`)
    if ((id === 'about' || id === 'contact') && !metrics.ownerAuthority.pageDirectoryVisible)
      report.issues.push(`${viewport.name} ${route}: owner-authorized page contact directory is missing`)
    if (id === 'home' && (metrics.ownerAuthority.testimonials.feature !== 1 || metrics.ownerAuthority.testimonials.rows !== 8))
      report.issues.push(`${viewport.name} ${route}: owner-authorized testimonial coverage is incomplete`)
    if (capabilityRequests !== null) {
      for (const request of capabilityRequests) {
        if (!request.ok) report.issues.push(`${viewport.name} ${route}: capability request failed for ${request.src}`)
      }
    }
    await page.screenshot({ path: path.join(folder, `${id}-first-screen.png`), fullPage: false })
    await page.screenshot({ path: path.join(folder, `${id}.png`), fullPage: true })
    if (id === 'home' && (viewport.name === '1440' || viewport.name === '390')) {
      const frames = page.locator('.home-cap .cap-media .feature-frame')
      for (let index = 0; index < (await frames.count()); index += 1) {
        await frames
          .nth(index)
          .screenshot({ path: path.join(folder, `home-capability-media-${capabilityNames[index] ?? index + 1}.png`) })
      }
      await page.locator('.testimonials').screenshot({ path: path.join(folder, 'home-testimonials.png') })
      await page.locator('.contact-directory--footer').screenshot({ path: path.join(folder, 'footer-offices.png') })
    }
    await page.close()
  }
  await context.close()
}

await browser.close()
writeFileSync(path.join(out, `responsive-report${onlyViewport === undefined ? '' : `-${onlyViewport}`}.json`), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
