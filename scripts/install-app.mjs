/**
 * Installs the freshly built app over the copy in /Applications.
 *
 * Without this you have to open the DMG and drag the app across on every build,
 * and it is easy to end up running a stale version without noticing. This is
 * not a self-updater -- the app does not check for anything on launch. It just
 * means `npm run package` leaves the installed copy current.
 *
 * Uses ditto rather than cp so bundle metadata survives, and clears the
 * quarantine flag so an unsigned build opens without the Gatekeeper warning.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = join(ROOT, 'release')
const APPLICATIONS = '/Applications'

function findBuiltApp() {
  if (!existsSync(RELEASE)) return null
  for (const entry of readdirSync(RELEASE)) {
    const dir = join(RELEASE, entry)
    if (!entry.startsWith('mac') || !statSync(dir).isDirectory()) continue
    const app = readdirSync(dir).find((f) => f.endsWith('.app'))
    if (app) return join(dir, app)
  }
  return null
}

const built = findBuiltApp()
if (!built) {
  console.error('install-app: no built .app under release/ — run the build first')
  process.exit(1)
}

const name = built.split('/').pop()
const target = join(APPLICATIONS, name)

// Only ever replace a bundle of the same name: never anything else in /Applications.
if (existsSync(target)) {
  if (!target.endsWith('.app') || !statSync(target).isDirectory()) {
    console.error(`install-app: ${target} is not an app bundle, leaving it alone`)
    process.exit(1)
  }
  const running = execFileSync('/bin/sh', [
    '-c',
    `pgrep -f ${JSON.stringify(`${target}/Contents/MacOS/`)} || true`
  ])
    .toString()
    .trim()
  if (running) {
    console.error(`install-app: ${name} is running — quit it and run this again`)
    process.exit(1)
  }
  rmSync(target, { recursive: true, force: true })
}

execFileSync('/usr/bin/ditto', [built, target])
try {
  execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', target])
} catch {
  /* nothing to clear */
}

console.log(`install-app: ${name} installed to ${APPLICATIONS}`)
