const { chromium } = require('playwright')
const path = require('path')
const readline = require('readline')

;(async () => {
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('https://www.linkedin.com/login')
    console.log('Log in to LinkedIn in the browser window. Press Enter here when done...')

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    await new Promise(resolve => rl.once('line', resolve))
    rl.close()

    const outputPath = path.join(process.cwd(), 'linkedin.json')
    await context.storageState({ path: outputPath })
    console.log(`Session saved to ${outputPath}`)
  } finally {
    await browser.close()
  }
  process.exit(0)
})()
