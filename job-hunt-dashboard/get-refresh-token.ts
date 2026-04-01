// Temporary script to get Google OAuth refresh token
// Run with: bun get-refresh-token.ts
// Delete this file after you have your refresh token

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment first')
  process.exit(1)
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`

console.log('\n1. Open this URL in your browser:\n')
console.log(authUrl)
console.log('\n2. Sign in and grant access')
console.log('3. Copy the code shown on the page\n')

process.stdout.write('Paste the code here: ')
const code = await new Promise<string>(resolve => {
  process.stdin.once('data', chunk => {
    process.stdin.destroy()
    resolve(chunk.toString().trim())
  })
})

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }),
})

const data = await res.json() as Record<string, string>

if (data.refresh_token) {
  console.log('\n✅ Add this to your .env file:\n')
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`)
} else {
  console.error('\n❌ Failed to get refresh token:')
  console.error(JSON.stringify(data, null, 2))
}
