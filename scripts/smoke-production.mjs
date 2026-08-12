import { spawn } from 'node:child_process'

const port = 3199
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let logs = ''
server.stdout.on('data', chunk => { logs += chunk })
server.stderr.on('data', chunk => { logs += chunk })

async function status(path, init) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual', ...init })
  return response.status
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (await status('/') === 200) return
    } catch { /* server still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Production server did not start\n${logs}`)
}

try {
  await waitUntilReady()
  const checks = [
    ['home', '/', 200],
    ['oauth callback', '/auth/callback', 200],
    ['public invoice', '/invoice/DOES-NOT-EXIST', 200],
    ['protected wallet page', '/wallet', 307],
    ['wallet API auth', '/api/wallet', 401],
    ['invoice API auth', '/api/invoices', 401],
    ['invoice cron auth', '/api/cron/invoice-index', 401],
  ]
  for (const [name, path, expected] of checks) {
    const actual = await status(path)
    if (actual !== expected) throw new Error(`${name}: expected ${expected}, received ${actual}`)
    console.log(`✓ ${name}: ${actual}`)
  }
} finally {
  server.kill('SIGTERM')
}
