import { chromium } from 'playwright'

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdf = await page.pdf({ format: 'A4' })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
