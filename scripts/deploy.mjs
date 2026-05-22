#!/usr/bin/env node
/**
 * Deploy the production build of the container-calc static site
 * to the remote Nginx server.
 *
 * Steps:
 *   1. Build locally with `npm run build`.
 *   2. Backup the current site directory on the remote host.
 *   3. Upload `dist/*` to a temporary staging directory on the remote host.
 *   4. Sync staging into the live site directory with `rsync --delete`.
 *   5. Reset ownership and permissions on the live site directory.
 *   6. Run a local HTTP health check on the remote host.
 *
 * Configuration is read from environment variables, all with safe defaults:
 *   DEPLOY_SSH_HOST     SSH host alias to deploy to.
 *                       Default: `tencent-container-layout`.
 *   DEPLOY_REMOTE_USER  Optional user@host override. If set, used verbatim
 *                       and DEPLOY_SSH_HOST is ignored.
 *   DEPLOY_SITE_ROOT    Live site directory on the remote host.
 *                       Default: `/usr/share/nginx/html`.
 *   DEPLOY_BACKUP_BASE  Backup directory prefix on the remote host.
 *                       Default: `/root/cargo_project-backup`.
 *   DEPLOY_STAGING_DIR  Temporary staging directory on the remote host.
 *                       Default: `/tmp/cargo-dist`.
 *   DEPLOY_HEALTHCHECK  URL the remote host hits for the health check.
 *                       Default: `http://127.0.0.1/`.
 *   DEPLOY_OWNER        chown target for the live site directory.
 *                       Default: `root:root`.
 *   DEPLOY_SKIP_BUILD   When set to `1`, skip the local `npm run build` step.
 *
 * CLI flags:
 *   --dry-run   Print every command that would be executed without running it.
 *   --help      Show this help text and exit.
 *
 * Security:
 *   - This script never embeds passwords or private keys.
 *   - SSH authentication relies on the user's existing SSH agent or key files
 *     resolved via the SSH host alias.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve(new URL('..', import.meta.url).pathname)

const CONFIG = Object.freeze({
  sshTarget: process.env.DEPLOY_REMOTE_USER || process.env.DEPLOY_SSH_HOST || 'tencent-container-layout',
  siteRoot: process.env.DEPLOY_SITE_ROOT || '/usr/share/nginx/html',
  backupBase: process.env.DEPLOY_BACKUP_BASE || '/root/cargo_project-backup',
  stagingDir: process.env.DEPLOY_STAGING_DIR || '/tmp/cargo-dist',
  healthcheckUrl: process.env.DEPLOY_HEALTHCHECK || 'http://127.0.0.1/',
  owner: process.env.DEPLOY_OWNER || 'root:root',
  skipBuild: process.env.DEPLOY_SKIP_BUILD === '1',
})

const HELP_TEXT = `Usage: node scripts/deploy.mjs [options]

Options:
  --dry-run    Print commands without executing them.
  --help, -h   Show this help text.

Environment variables (all optional):
  DEPLOY_SSH_HOST       SSH host alias (default: tencent-container-layout)
  DEPLOY_REMOTE_USER    Explicit user@host override
  DEPLOY_SITE_ROOT      Remote live directory (default: /usr/share/nginx/html)
  DEPLOY_BACKUP_BASE    Remote backup directory prefix (default: /root/cargo_project-backup)
  DEPLOY_STAGING_DIR    Remote staging directory (default: /tmp/cargo-dist)
  DEPLOY_HEALTHCHECK    Remote health-check URL (default: http://127.0.0.1/)
  DEPLOY_OWNER          chown target (default: root:root)
  DEPLOY_SKIP_BUILD     Set to 1 to skip 'npm run build'
`

function parseArgs(argv) {
  const flags = { dryRun: false, help: false }
  for (const arg of argv) {
    if (arg === '--dry-run') {
      flags.dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true
    } else {
      console.error(`Unknown argument: ${arg}`)
      console.error(HELP_TEXT)
      process.exit(1)
    }
  }
  return flags
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  const yyyy = date.getUTCFullYear()
  const mm = pad(date.getUTCMonth() + 1)
  const dd = pad(date.getUTCDate())
  const HH = pad(date.getUTCHours())
  const MM = pad(date.getUTCMinutes())
  const SS = pad(date.getUTCSeconds())
  return `${yyyy}${mm}${dd}-${HH}${MM}${SS}`
}

function shellQuote(value) {
  if (value === '') {
    return "''"
  }
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) {
    return value
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function runCommand(command, { dryRun, label, cwd }) {
  const prefix = dryRun ? '[dry-run] $' : '$'
  console.log(`${prefix} ${label ?? command}`)
  if (dryRun) {
    return ''
  }
  try {
    const output = execSync(command, {
      cwd: cwd ?? PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
    })
    return output.trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Command failed: ${label ?? command}\n${message}`)
  }
}

function runStreamingCommand(command, { dryRun, label, cwd }) {
  const prefix = dryRun ? '[dry-run] $' : '$'
  console.log(`${prefix} ${label ?? command}`)
  if (dryRun) {
    return
  }
  try {
    execSync(command, {
      cwd: cwd ?? PROJECT_ROOT,
      stdio: 'inherit',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Command failed: ${label ?? command}\n${message}`)
  }
}

function buildSshCommand(sshTarget, remoteScript) {
  return `ssh ${shellQuote(sshTarget)} ${shellQuote(remoteScript)}`
}

function ensureDistExists() {
  const distPath = resolve(PROJECT_ROOT, 'dist')
  if (!existsSync(distPath)) {
    throw new Error(`Build output not found at ${distPath}. Run 'npm run build' first.`)
  }
  return distPath
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  if (flags.help) {
    console.log(HELP_TEXT)
    return
  }

  const dryRun = flags.dryRun
  const timestamp = formatTimestamp(new Date())
  const backupDir = `${CONFIG.backupBase}-${timestamp}`

  console.log('=== container-calc deploy ===')
  console.log(`Target:        ${CONFIG.sshTarget}`)
  console.log(`Site root:     ${CONFIG.siteRoot}`)
  console.log(`Backup dir:    ${backupDir}`)
  console.log(`Staging dir:   ${CONFIG.stagingDir}`)
  console.log(`Health check:  ${CONFIG.healthcheckUrl}`)
  console.log(`Dry-run:       ${dryRun ? 'yes' : 'no'}`)
  console.log('')

  // Step 1: local build
  if (CONFIG.skipBuild) {
    console.log('Step 1/6 Skipping local build (DEPLOY_SKIP_BUILD=1)')
  } else {
    console.log('Step 1/6 Building locally with npm run build')
    runStreamingCommand('npm run build', { dryRun, label: 'npm run build' })
  }

  if (!dryRun) {
    ensureDistExists()
  }

  // Step 2: remote backup
  console.log('Step 2/6 Creating remote backup')
  const backupScript = [
    'set -e',
    `backup=${shellQuote(backupDir)}`,
    `mkdir -p "$backup"`,
    `if [ -d ${shellQuote(CONFIG.siteRoot)} ] && [ -n "$(ls -A ${shellQuote(CONFIG.siteRoot)} 2>/dev/null)" ]; then`,
    `  cp -a ${shellQuote(CONFIG.siteRoot)}/. "$backup"/`,
    'else',
    `  echo "Warning: ${CONFIG.siteRoot} is empty; skipping copy"`,
    'fi',
    'echo "$backup"',
  ].join('; ')
  const createdBackup = runCommand(buildSshCommand(CONFIG.sshTarget, backupScript), {
    dryRun,
    label: `ssh ${CONFIG.sshTarget} 'backup -> ${backupDir}'`,
  })
  if (!dryRun && createdBackup) {
    console.log(`         Backup saved at: ${createdBackup}`)
  }

  // Step 3: prepare staging and scp dist
  console.log('Step 3/6 Uploading dist to remote staging directory')
  const prepStaging = [
    'set -e',
    `rm -rf ${shellQuote(CONFIG.stagingDir)}`,
    `mkdir -p ${shellQuote(CONFIG.stagingDir)}`,
  ].join('; ')
  runCommand(buildSshCommand(CONFIG.sshTarget, prepStaging), {
    dryRun,
    label: `ssh ${CONFIG.sshTarget} 'prepare ${CONFIG.stagingDir}'`,
  })
  runStreamingCommand(
    `scp -r dist/* ${shellQuote(`${CONFIG.sshTarget}:${CONFIG.stagingDir}/`)}`,
    { dryRun, label: `scp -r dist/* ${CONFIG.sshTarget}:${CONFIG.stagingDir}/` },
  )

  // Step 4: rsync staging -> live
  console.log('Step 4/6 Syncing staging into live site directory')
  const rsyncScript = `rsync -a --delete ${shellQuote(`${CONFIG.stagingDir}/`)} ${shellQuote(`${CONFIG.siteRoot}/`)}`
  runStreamingCommand(buildSshCommand(CONFIG.sshTarget, rsyncScript), {
    dryRun,
    label: `ssh ${CONFIG.sshTarget} 'rsync staging -> live'`,
  })

  // Step 5: ownership + permissions
  console.log('Step 5/6 Resetting ownership and permissions on live site')
  const permsScript = [
    'set -e',
    `chown -R ${shellQuote(CONFIG.owner)} ${shellQuote(CONFIG.siteRoot)}`,
    `chmod -R a+rX ${shellQuote(CONFIG.siteRoot)}`,
  ].join(' && ')
  runStreamingCommand(buildSshCommand(CONFIG.sshTarget, permsScript), {
    dryRun,
    label: `ssh ${CONFIG.sshTarget} 'chown/chmod ${CONFIG.siteRoot}'`,
  })

  // Step 6: healthcheck
  console.log('Step 6/6 Running remote HTTP health check')
  const healthScript = `curl -fsS ${shellQuote(CONFIG.healthcheckUrl)} >/dev/null && echo deployed`
  const healthOutput = runCommand(buildSshCommand(CONFIG.sshTarget, healthScript), {
    dryRun,
    label: `ssh ${CONFIG.sshTarget} 'curl ${CONFIG.healthcheckUrl}'`,
  })
  if (!dryRun) {
    if (healthOutput !== 'deployed') {
      throw new Error(`Health check did not return 'deployed' (got: ${JSON.stringify(healthOutput)})`)
    }
    console.log('         Health check passed.')
  }

  console.log('')
  console.log(dryRun
    ? 'Dry-run complete. No remote state changed.'
    : `Deployment complete. Backup: ${createdBackup || backupDir}`)
}

main().catch((error) => {
  console.error('')
  console.error('Deployment failed:')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
