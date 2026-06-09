import { chromium } from 'playwright'

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (window as unknown as { __paginationComplete?: boolean }).__paginationComplete === true,
      { timeout: 15_000 }
    )
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
