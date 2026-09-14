import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const statusPath = join(root, 'plans/status.json')
const changelogPath = join(root, 'CHANGELOG.md')
const decisionPath = join(root, 'decision.md')

const ALLOWED_STATUSES = new Set([
  'open',
  'in-progress',
  'verified',
  'committed',
  'deployed',
  'superseded',
  'blocked',
])

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function commitExists(commit) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function completedSectionsWithOpenCheckboxes(changelog) {
  const lines = changelog.split(/\r?\n/)
  const findings = []
  let completedLevel = 0
  let sectionTitle = ''
  for (const line of lines) {
    const heading = line.match(/^(#{2,3})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const title = heading[0].trim()
      if (completedLevel && level <= completedLevel) {
        completedLevel = /（已完成）|\(completed\)/i.test(title) ? level : 0
        sectionTitle = completedLevel ? title : ''
      } else if (!completedLevel && /（已完成）|\(completed\)/i.test(title)) {
        completedLevel = level
        sectionTitle = title
      }
      continue
    }
    if (completedLevel && /^\s*-\s*\[\s\]\s+/.test(line)) {
      findings.push({ sectionTitle, line: line.trim() })
    }
  }
  return findings
}

function supersedeMentions(text, taskId) {
  const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`supersede[sd]?[^\\n]*${escaped}|${escaped}[^\\n]*supersede[sd]?`, 'i').test(text)
}

const status = loadJson(statusPath)
const changelog = readFileSync(changelogPath, 'utf8')
const decision = readFileSync(decisionPath, 'utf8')
const combinedDocs = `${changelog}\n${decision}`

if (!Array.isArray(status.tasks) || status.tasks.length === 0) {
  fail('plans/status.json must contain a non-empty tasks array')
}

for (const task of status.tasks) {
  const id = task.id ?? '<missing-id>'
  if (typeof task.id !== 'string' || task.id.trim() === '') fail('task is missing id')
  if (typeof task.plan !== 'string' || task.plan.trim() === '') fail(`${id}: missing plan`)
  if (!ALLOWED_STATUSES.has(task.status)) fail(`${id}: invalid status ${task.status}`)

  if (task.status === 'committed' || task.status === 'deployed') {
    if (typeof task.commit !== 'string' || task.commit.trim() === '') {
      fail(`${id}: ${task.status} task requires commit`)
    } else if (!commitExists(task.commit)) {
      fail(`${id}: commit ${task.commit} is not in git history`)
    }
  }

  if (task.status === 'verified' || task.status === 'committed' || task.status === 'deployed') {
    const commands = Array.isArray(task.verification?.commands) ? task.verification.commands : []
    const result = task.verification?.result
    if (commands.length === 0) fail(`${id}: ${task.status} task requires verification.commands`)
    if (typeof result !== 'string' || result.trim() === '') {
      fail(`${id}: ${task.status} task requires verification.result`)
    }
  }

  if (task.status === 'superseded') {
    if (typeof task.supersededBy !== 'string' || task.supersededBy.trim() === '') {
      fail(`${id}: superseded task requires supersededBy`)
    }
  }
}

const openCompleted = completedSectionsWithOpenCheckboxes(changelog)
for (const finding of openCompleted) {
  const taskMatch = finding.line.match(/\b(P\d+(?:-\d+[a-z]?)?)\b/i)
  const taskId = taskMatch?.[1]
  if (taskId && supersedeMentions(combinedDocs, taskId)) continue
  fail(
    `CHANGELOG completed section still has an open checkbox without supersede: ${finding.sectionTitle} :: ${finding.line}`,
  )
}

if (process.exitCode && process.exitCode !== 0) {
  console.error('round-status check FAILED')
  process.exit(process.exitCode)
}

console.log(`round-status check passed (${status.tasks.length} tasks)`)
