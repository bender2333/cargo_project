#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createSshInvocation, shellQuote } from './deployCommands.mjs'

export const DEFAULT_CONFIG = Object.freeze({
  sshTarget: 'cargo-server',
  siteRoot: '/usr/share/nginx/html',
  appRoot: '/opt/cargo-server',
  serviceName: 'cargo-server.service',
  owner: 'root:root',
  backupBase: '/root/cargo_project-backup',
  incidentBase: '/root/cargo_project-incident',
  lockPath: '/run/cargo-project-rollback.lock',
  healthcheckUrl: 'http://127.0.0.1/',
  apiHealthcheckUrl: 'http://127.0.0.1/api/import-templates',
})

const DATABASE_EXCLUSIONS = Object.freeze([
  'database.db',
  'database.db-shm',
  'database.db-wal',
  'database.db-journal',
])
const LOCK_BASENAME = 'cargo-project-rollback.lock'
const UNSAFE_COMMAND_VALUE = /(?:\u0000|\r|\n|;|\||&|\$|`|\(|\)|<|>|\\)/u
const SAFE_TOKEN = /^[A-Za-z0-9_.:@%+,-]+$/u
const PATH_TRAVERSAL = /(^|\/)\.{1,2}(?=\/|$)/u

export const HELP_TEXT = `Usage: node scripts/rollback.mjs --backup <absolute POSIX remote path> [--dry-run]

Options:
  --backup <path>  Remote deployment backup directory (required).
  --dry-run        Print the complete SSH invocation without executing it.
  --help, -h       Show this help text.
`

function assertSafeValue(value, label) {
  if (typeof value !== 'string' || value.length === 0 || UNSAFE_COMMAND_VALUE.test(value)) {
    throw new Error(`${label} contains an unsafe command value.`)
  }
  return value
}

function assertRemotePath(value, label) {
  const safeValue = assertSafeValue(value, label)
  if (
    !safeValue.startsWith('/') ||
    safeValue === '/' ||
    safeValue.endsWith('/') ||
    safeValue.includes('//') ||
    PATH_TRAVERSAL.test(safeValue)
  ) {
    throw new Error(`${label} must be a non-root absolute POSIX path without traversal.`)
  }
  return safeValue
}

function assertLockPath(value, label) {
  const safeValue = assertRemotePath(value, label)
  const basename = safeValue.slice(safeValue.lastIndexOf('/') + 1)
  if (basename !== LOCK_BASENAME) {
    throw new Error(`${label} must use basename ${LOCK_BASENAME}.`)
  }
  return safeValue
}

function assertSafeToken(value, label) {
  const safeValue = assertSafeValue(value, label)
  if (safeValue.startsWith('-') || !SAFE_TOKEN.test(safeValue)) {
    throw new Error(`${label} contains an unsafe command value.`)
  }
  return safeValue
}

function assertHealthUrl(value, label) {
  const safeValue = assertSafeValue(value, label)
  let url
  try {
    url = new URL(safeValue)
  } catch {
    throw new Error(`${label} must be an HTTP(S) URL.`)
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(`${label} must be an HTTP(S) URL without userinfo.`)
  }
  return safeValue
}

function normalizeConfig(config = {}) {
  const supplied = config ?? {}
  const healthcheckUrl = assertHealthUrl(
    supplied.healthcheckUrl ?? DEFAULT_CONFIG.healthcheckUrl,
    'healthcheckUrl',
  )
  return {
    sshTarget: assertSafeToken(supplied.sshTarget ?? DEFAULT_CONFIG.sshTarget, 'sshTarget'),
    siteRoot: assertRemotePath(supplied.siteRoot ?? DEFAULT_CONFIG.siteRoot, 'siteRoot'),
    appRoot: assertRemotePath(supplied.appRoot ?? DEFAULT_CONFIG.appRoot, 'appRoot'),
    serviceName: assertSafeToken(
      supplied.serviceName ?? DEFAULT_CONFIG.serviceName,
      'serviceName',
    ),
    owner: assertSafeToken(supplied.owner ?? DEFAULT_CONFIG.owner, 'owner'),
    backupBase: assertRemotePath(
      supplied.backupBase ?? DEFAULT_CONFIG.backupBase,
      'backupBase',
    ),
    incidentBase: assertRemotePath(
      supplied.incidentBase ?? DEFAULT_CONFIG.incidentBase,
      'incidentBase',
    ),
    lockPath: assertLockPath(supplied.lockPath ?? DEFAULT_CONFIG.lockPath, 'lockPath'),
    healthcheckUrl,
    apiHealthcheckUrl: DEFAULT_CONFIG.apiHealthcheckUrl,
  }
}

export function configFromEnv(env = process.env) {
  return normalizeConfig({
    sshTarget: env.DEPLOY_REMOTE_USER || env.DEPLOY_SSH_HOST || DEFAULT_CONFIG.sshTarget,
    siteRoot: env.DEPLOY_SITE_ROOT || DEFAULT_CONFIG.siteRoot,
    appRoot: env.DEPLOY_APP_ROOT || DEFAULT_CONFIG.appRoot,
    serviceName: env.DEPLOY_SERVICE || DEFAULT_CONFIG.serviceName,
    owner: env.DEPLOY_OWNER || DEFAULT_CONFIG.owner,
    backupBase: env.DEPLOY_BACKUP_BASE || DEFAULT_CONFIG.backupBase,
    incidentBase: env.ROLLBACK_INCIDENT_BASE || DEFAULT_CONFIG.incidentBase,
    lockPath: DEFAULT_CONFIG.lockPath,
    healthcheckUrl: env.DEPLOY_HEALTHCHECK || DEFAULT_CONFIG.healthcheckUrl,
  })
}

export function assertDatabaseExclusions(script) {
  if (typeof script !== 'string') {
    throw new Error('Rollback script is required to verify database exclusions.')
  }

  const exclusions = [...script.matchAll(/--exclude=([^\s\\]+)/gu)].map((match) => match[1])
  const databaseExclusions = exclusions.filter((value) => value.startsWith('database.db'))
  if (
    databaseExclusions.length !== DATABASE_EXCLUSIONS.length ||
    new Set(databaseExclusions).size !== DATABASE_EXCLUSIONS.length ||
    DATABASE_EXCLUSIONS.some((value) => !databaseExclusions.includes(value))
  ) {
    throw new Error(
      `Rollback script must contain exactly these database exclusions: ${DATABASE_EXCLUSIONS.join(', ')}`,
    )
  }

  const backendSource = '-- "$1"/ "$server_root"/'
  const backendSourceIndex = script.indexOf(backendSource)
  const backendStart = script.lastIndexOf('rsync -a --delete', backendSourceIndex)
  if (backendSourceIndex < 0 || backendStart < 0) {
    throw new Error('Rollback script backend restore is missing.')
  }
  const backendRestore = script.slice(backendStart, backendSourceIndex)
  if (
    !backendRestore.includes('--include=\'/*.mjs\'') ||
    !backendRestore.includes('--exclude=\'/*\'') ||
    DATABASE_EXCLUSIONS.some((value) => !backendRestore.includes(`--exclude=${value}`))
  ) {
    throw new Error('Rollback script must restore modules while protecting the database family.')
  }

  return true
}

export function assertMatchingDatabaseHashes(incidentHash, liveHash) {
  if (
    typeof incidentHash !== 'string' ||
    typeof liveHash !== 'string' ||
    incidentHash.trim() === '' ||
    liveHash.trim() === ''
  ) {
    throw new Error('Database hash values are required.')
  }
  if (incidentHash.trim() !== liveHash.trim()) {
    throw new Error(`Database hash mismatch: incident=${incidentHash.trim()} live=${liveHash.trim()}`)
  }
  return true
}

export function buildRollbackRemoteScript(config = DEFAULT_CONFIG, backupDir, incidentBase) {
  const normalized = normalizeConfig(config)
  const safeBackupDir = assertRemotePath(backupDir, 'backupDir')
  const safeIncidentBase = assertRemotePath(
    incidentBase ?? normalized.incidentBase,
    'incidentBase',
  )

  return [
    'set -e',
    'umask 077',
    `backup_dir=${shellQuote(safeBackupDir)}`,
    `backup_base=${shellQuote(normalized.backupBase)}`,
    `site_root=${shellQuote(normalized.siteRoot)}`,
    `app_root=${shellQuote(normalized.appRoot)}`,
    `service_name=${shellQuote(normalized.serviceName)}`,
    `owner=${shellQuote(normalized.owner)}`,
    `healthcheck_url=${shellQuote(normalized.healthcheckUrl)}`,
    `api_healthcheck_url=${shellQuote(normalized.apiHealthcheckUrl)}`,
    `incident_base=${shellQuote(safeIncidentBase)}`,
    `lock_path=${shellQuote(normalized.lockPath)}`,
    'server_root="$app_root/server"',
    'incident_dir=',
    'rollback_db_failure=0',
    'service_stopped=0',
    'snapshot_ready=0',
    '',
    'fatal() {',
    '  printf \'ROLLBACK FATAL: %s\\n\' "$*" >&2',
    '  return 1',
    '}',
    '',
    'wait_for_http_status() {',
    '  wait_url="$1"',
    '  wait_expected="$2"',
    '  wait_label="$3"',
    '  wait_last_status=',
    '  wait_attempt=1',
    '  while [ "$wait_attempt" -le 10 ]; do',
    '    if wait_last_status="$(curl --connect-timeout 2 --max-time 3 --silent --show-error --output /dev/null --write-out \'%{http_code}\' "$wait_url")"; then',
    '      [ "$wait_last_status" = "$wait_expected" ] && return 0',
    '    else',
    '      wait_last_status=000',
    '    fi',
    '    if [ "$wait_attempt" -lt 10 ]; then sleep 1; fi',
    '    wait_attempt=$((wait_attempt + 1))',
    '  done',
    '  fatal "$wait_label status was $wait_last_status, expected $wait_expected"',
    '  return 1',
    '}',
    '',
    'path_overlaps() {',
    '  case "$1" in',
    '    "$2"|"$2"/*) return 0 ;;',
    '  esac',
    '  case "$2" in',
    '    "$1"|"$1"/*) return 0 ;;',
    '  esac',
    '  return 1',
    '}',
    '',
    'database_manifest() {',
    '  db_manifest_root="$1"',
    '  db_manifest_file="$2"',
    '  : > "$db_manifest_file.tmp"',
    '  for db_file in "$db_manifest_root"/database.db*; do',
    '    [ -e "$db_file" ] || continue',
    '    [ ! -L "$db_file" ] || { fatal "SQLite artifact is a symlink: $db_file"; return 1; }',
    '    [ -f "$db_file" ] || { fatal "SQLite artifact is not a regular file: $db_file"; return 1; }',
    '    if ! db_hash_line="$(sha256sum -b -- "$db_file")"; then',
    '      fatal "Unable to hash SQLite artifact: $db_file"',
    '      return 1',
    '    fi',
    '    db_hash="${db_hash_line%% *}"',
    '    if [ "${#db_hash}" -ne 64 ]; then',
    '      fatal "Invalid SHA-256 output for SQLite artifact: $db_file"',
    '      return 1',
    '    fi',
    '    if ! db_metadata="$(stat -c \'%u:%g:%A\' -- "$db_file")"; then',
    '      fatal "Unable to stat SQLite artifact: $db_file"',
    '      return 1',
    '    fi',
    '    printf \'%s\\t%s\\t%s\\n\' "${db_file##*/}" "$db_hash" "$db_metadata" >> "$db_manifest_file.tmp"',
    '  done',
    '  if ! LC_ALL=C sort "$db_manifest_file.tmp" > "$db_manifest_file"; then',
    '    fatal "Unable to sort SQLite manifest: $db_manifest_file"',
    '    return 1',
    '  fi',
    '}',
    '',
    'file_manifest() {',
    '  manifest_root="$1"',
    '  manifest_file="$2"',
    '  manifest_kind="$3"',
    '  : > "$manifest_file.tmp"',
    '  if [ "$manifest_kind" = "static" ]; then',
    '    if ! find -P "$manifest_root" -mindepth 1 -type f ! -path "$manifest_root/server/*" -print > "$manifest_file.paths"; then',
    '      fatal "Unable to enumerate static files: $manifest_root"',
    '      return 1',
    '    fi',
    '  else',
    '    if ! find -P "$manifest_root" -maxdepth 1 -type f ! -name \'database.db*\' -name \'*.mjs\' -print > "$manifest_file.paths"; then',
    '      fatal "Unable to enumerate module files: $manifest_root"',
    '      return 1',
    '    fi',
    '  fi',
    '  if ! LC_ALL=C sort "$manifest_file.paths" > "$manifest_file.paths.sorted"; then',
    '    fatal "Unable to sort manifest paths: $manifest_file"',
    '    return 1',
    '  fi',
    '  while IFS= read -r manifest_path; do',
    '    [ -n "$manifest_path" ] || continue',
    '    if ! manifest_hash_line="$(sha256sum -b -- "$manifest_path")"; then',
    '      fatal "Unable to hash manifest file: $manifest_path"',
    '      return 1',
    '    fi',
    '    manifest_hash="${manifest_hash_line%% *}"',
    '    if [ "${#manifest_hash}" -ne 64 ]; then',
    '      fatal "Invalid SHA-256 output for manifest file: $manifest_path"',
    '      return 1',
    '    fi',
    '    printf \'%s\\t%s\\n\' "${manifest_path#"$manifest_root"/}" "$manifest_hash" >> "$manifest_file.tmp"',
    '  done < "$manifest_file.paths.sorted"',
    '  if ! LC_ALL=C sort "$manifest_file.tmp" > "$manifest_file"; then',
    '    fatal "Unable to finalize manifest: $manifest_file"',
    '    return 1',
    '  fi',
    '}',
    '',
    'compare_manifest() {',
    '  if ! cmp -s "$1" "$2"; then',
    '    fatal "Manifest mismatch: $1 versus $2"',
    '    return 1',
    '  fi',
    '}',
    '',
    'compare_main_database_hash() {',
    '  if ! incident_hash_line="$(sha256sum -b -- "$server_incident/database.db")"; then',
    '    fatal "Unable to hash incident database"',
    '    return 1',
    '  fi',
    '  if ! live_hash_line="$(sha256sum -b -- "$server_root/database.db")"; then',
    '    fatal "Unable to hash live database"',
    '    return 1',
    '  fi',
    '  incident_db_hash="${incident_hash_line%% *}"',
    '  live_db_hash="${live_hash_line%% *}"',
    '  if [ "$incident_db_hash" != "$live_db_hash" ]; then',
    '    printf \'Database hash mismatch: incident=%s live=%s\\n\' "$incident_db_hash" "$live_db_hash" >&2',
    '    return 1',
    '  fi',
    '}',
    '',
    'secure_metadata() {',
    '  secure_path="$1"',
    '  secure_label="$2"',
    '  [ ! -L "$secure_path" ] || { fatal "$secure_label contains symlink: $secure_path"; return 1; }',
    '  if ! secure_owner="$(stat -c \'%u:%g\' -- "$secure_path")"; then fatal "Unable to stat $secure_label: $secure_path"; return 1; fi',
    '  [ "$secure_owner" = "0:0" ] || { fatal "$secure_label must be root-owned: $secure_path"; return 1; }',
    '  if ! secure_mode="$(stat -c \'%A\' -- "$secure_path")"; then fatal "Unable to stat $secure_label mode: $secure_path"; return 1; fi',
    '  secure_group_other="${secure_mode#????}"',
    '  case "$secure_group_other" in *w*) fatal "$secure_label is group/world writable: $secure_path"; return 1 ;; esac',
    '}',
    '',
    'secure_directory() {',
    '  [ -d "$1" ] || { fatal "$2 is not a directory: $1"; return 1; }',
    '  secure_metadata "$1" "$2"',
    '}',
    '',
    'secure_lock_target() {',
    '  secure_lock_path="$1"',
    '  secure_lock_label="$2"',
    '  [ ! -L "$secure_lock_path" ] || { fatal "$secure_lock_label cannot be a symlink: $secure_lock_path"; return 1; }',
    '  [ -f "$secure_lock_path" ] || { fatal "$secure_lock_label must be a regular file: $secure_lock_path"; return 1; }',
    '  secure_metadata "$secure_lock_path" "$secure_lock_label"',
    '}',
    '',
    'secure_ancestor_chain() {',
    '  secure_ancestor_path="$1"',
    '  secure_ancestor_label="$2"',
    '  while :; do',
    '    secure_directory "$secure_ancestor_path" "$secure_ancestor_label" || return 1',
    '    [ "$secure_ancestor_path" = "/" ] && break',
    '    secure_ancestor_path="$(dirname -- "$secure_ancestor_path")"',
    '    secure_ancestor_path="$(realpath -e -- "$secure_ancestor_path")" || { fatal "Unable to canonicalize $secure_ancestor_label"; return 1; }',
    '  done',
    '}',
    '',
    'secure_tree_entries() {',
    '  secure_tree_root="$1"',
    '  secure_tree_label="$2"',
    '  if ! secure_entry_list="$(find -P "$secure_tree_root" -mindepth 1 -print)"; then',
    '    fatal "Unable to enumerate $secure_tree_label: $secure_tree_root"',
    '    return 1',
    '  fi',
    '  while IFS= read -r secure_entry; do',
    '    [ -n "$secure_entry" ] || continue',
    '    secure_metadata "$secure_entry" "$secure_tree_label" || return 1',
    '  done <<EOF',
    '$secure_entry_list',
    'EOF',
    '}',
    '',
    'restore_static() {',
    '  rsync -a --delete --delete-excluded --exclude=/server/ -- "$1"/ "$site_root"/ || return 1',
    '  chown -R -- "$owner" "$site_root" || return 1',
    '  chmod -R a+rX -- "$site_root" || return 1',
    '}',
    '',
    'restore_modules() {',
    '  rsync -a --delete \\',
    '    --filter=\'hide /database.db*\' \\',
    '    --filter=\'protect /database.db*\' \\',
    '    --exclude=database.db \\',
    '    --exclude=database.db-shm \\',
    '    --exclude=database.db-wal \\',
    '    --exclude=database.db-journal \\',
    '    --include=\'/*.mjs\' \\',
    '    --exclude=\'/*\' \\',
    '    -- "$1"/ "$server_root"/',
    '}',
    '',
    'rollback_exit_handler() {',
    '  rollback_status="$?"',
    '  trap - EXIT',
    '  [ "$rollback_status" -eq 0 ] && exit 0',
    '  printf \'Rollback failed; retained incident: %s\\n\' "$incident_dir" >&2',
    '  if [ "$rollback_db_failure" -eq 1 ]; then',
    '    if ! systemctl stop -- "$service_name"; then',
    '      printf \'ROLLBACK FATAL: could not stop service after database/integrity failure: %s\\n\' "$service_name" >&2',
    '    fi',
    '    printf \'ROLLBACK FATAL: database/integrity gate failed; service left stopped; incident: %s\\n\' "$incident_dir" >&2',
    '    exit "$rollback_status"',
    '  fi',
    '  if [ "$service_stopped" -eq 1 ] && [ "$snapshot_ready" -eq 0 ]; then',
    '    if ! systemctl start -- "$service_name" || ! systemctl is-active --quiet -- "$service_name"; then',
    '      printf \'ROLLBACK FATAL: original service restart failed after server snapshot failure; incident: %s\\n\' "$incident_dir" >&2',
    '      exit 1',
    '    fi',
    '    printf \'ROLLBACK FATAL: server incident snapshot failed; original service restarted; incident: %s\\n\' "$incident_dir" >&2',
    '    exit "$rollback_status"',
    '  fi',
    '  if [ "$snapshot_ready" -eq 1 ]; then',
    '    if ! systemctl stop -- "$service_name"; then',
    '      printf \'ROLLBACK FATAL: recovery could not stop service: %s\\n\' "$service_name" >&2',
    '      exit 1',
    '    fi',
    '    if ! restore_static "$static_incident" || ! restore_modules "$server_incident"; then',
    '      printf \'ROLLBACK FATAL: recovery restore failed; service left stopped; incident: %s\\n\' "$incident_dir" >&2',
    '      exit 1',
    '    fi',
    '    if ! database_manifest "$server_incident" "$incident_dir/database-recovery-incident.manifest" || ! database_manifest "$server_root" "$incident_dir/database-recovery-live.manifest" || ! compare_manifest "$incident_dir/database-recovery-incident.manifest" "$incident_dir/database-recovery-live.manifest"; then',
    '      printf \'ROLLBACK FATAL: recovery changed the SQLite database; service left stopped; incident: %s\\n\' "$incident_dir" >&2',
    '      exit 1',
    '    fi',
    '    if ! systemctl start -- "$service_name" || ! systemctl is-active --quiet -- "$service_name"; then',
    '      printf \'ROLLBACK FATAL: recovery restart failed; service may be stopped; incident: %s\\n\' "$incident_dir" >&2',
    '      exit 1',
    '    fi',
    '  fi',
    '  exit "$rollback_status"',
    '}',
    '',
    'for required_command in cmp chmod chown curl find flock mkdir mktemp realpath rsync sha256sum sleep sort sqlite3 stat systemctl timeout dirname basename; do',
    '  command -v "$required_command" >/dev/null 2>&1 || { fatal "Required command is unavailable: $required_command"; exit 1; }',
    'done',
    'lock_parent="$(dirname -- "$lock_path")"',
    'lock_name="$(basename -- "$lock_path")"',
    '[ "$lock_name" = "cargo-project-rollback.lock" ] || { fatal "Rollback lock basename is not trusted: $lock_name"; exit 1; }',
    '[ -d "$lock_parent" ] || { fatal "Rollback lock directory does not exist: $lock_parent"; exit 1; }',
    'lock_parent="$(realpath -e -- "$lock_parent")" || { fatal "Rollback lock directory is not canonical: $lock_path"; exit 1; }',
    'secure_directory "$lock_parent" "Rollback lock parent" || exit 1',
    'lock_path="$lock_parent/$lock_name"',
    'if [ -e "$lock_path" ] || [ -L "$lock_path" ]; then',
    '  secure_lock_target "$lock_path" "Rollback lock" || exit 1',
    'fi',
    'exec 9>>"$lock_path" || { fatal "Unable to open rollback lock: $lock_path"; exit 1; }',
    'secure_lock_target "$lock_path" "Rollback lock" || exit 1',
    'flock -n 9 || { fatal "Another rollback is already running."; exit 1; }',
    '',
    'backup_base_parent="$(dirname -- "$backup_base")"',
    'backup_base_name="$(basename -- "$backup_base")"',
    'backup_base_parent="$(realpath -e -- "$backup_base_parent")" || { fatal "Backup base parent is not canonical: $backup_base"; exit 1; }',
    'secure_ancestor_chain "$backup_base_parent" "Backup base ancestor" || exit 1',
    '[ ! -L "$backup_dir" ] || { fatal "Backup root cannot be a symlink: $backup_dir"; exit 1; }',
    'backup_dir_parent="$(dirname -- "$backup_dir")"',
    '[ "$backup_dir_parent" = "$backup_base_parent" ] || { fatal "Backup must be a direct child of canonical backup base: $backup_dir"; exit 1; }',
    'backup_dir_name="$(basename -- "$backup_dir")"',
    'case "$backup_dir_name" in "$backup_base_name"-*) ;; *) fatal "Backup is outside canonical backup prefix: $backup_dir"; exit 1 ;; esac',
    '[ ! -L "$site_root" ] || { fatal "Site root cannot be a symlink: $site_root"; exit 1; }',
    '[ ! -L "$app_root" ] || { fatal "App root cannot be a symlink: $app_root"; exit 1; }',
    'site_root="$(realpath -e -- "$site_root")" || { fatal "Site root is not canonical: $site_root"; exit 1; }',
    'app_root="$(realpath -e -- "$app_root")" || { fatal "App root is not canonical: $app_root"; exit 1; }',
    'server_root="$app_root/server"',
    '[ -d "$server_root" ] || { fatal "Server root does not exist: $server_root"; exit 1; }',
    '[ ! -L "$server_root" ] || { fatal "Server root cannot be a symlink: $server_root"; exit 1; }',
    'incident_parent="$(dirname -- "$incident_base")"',
    'incident_name="$(basename -- "$incident_base")"',
    'incident_parent="$(realpath -e -- "$incident_parent")" || { fatal "Incident parent is not canonical: $incident_base"; exit 1; }',
    'secure_directory "$incident_parent" "Incident parent" || exit 1',
    'incident_prefix="$incident_parent/$incident_name"',
    '[ ! -L "$incident_base" ] || { fatal "Incident base cannot be a symlink: $incident_base"; exit 1; }',
    'secure_backup_owner="$(stat -c \'%u:%g\' -- "$backup_dir")" || { fatal "Unable to stat backup: $backup_dir"; exit 1; }',
    '[ "$secure_backup_owner" = "0:0" ] || { fatal "Backup must be root-owned: $backup_dir"; exit 1; }',
    'secure_backup_mode="$(stat -c \'%A\' -- "$backup_dir")" || { fatal "Unable to stat backup mode: $backup_dir"; exit 1; }',
    'secure_backup_group_other="${secure_backup_mode#????}"',
    'case "$secure_backup_group_other" in *w*) fatal "Backup is group/world writable: $backup_dir"; exit 1 ;; esac',
    '[ -z "$(find -P "$backup_dir" -type l -print -quit)" ] || { fatal "Backup contains symlinks: $backup_dir"; exit 1; }',
    '[ -d "$backup_dir" ] || { fatal "Backup path is not a directory: $backup_dir"; exit 1; }',
    'secure_directory "$backup_dir" "Backup root" || exit 1',
    'secure_tree_entries "$backup_dir" "Backup entry" || exit 1',
    'if path_overlaps "$backup_dir" "$site_root"; then fatal "Rollback paths overlap: $backup_dir / $site_root"; exit 1; fi',
    'if path_overlaps "$backup_dir" "$app_root"; then fatal "Rollback paths overlap: $backup_dir / $app_root"; exit 1; fi',
    'if path_overlaps "$backup_dir" "$server_root"; then fatal "Rollback paths overlap: $backup_dir / $server_root"; exit 1; fi',
    'if path_overlaps "$lock_path" "$backup_dir" || path_overlaps "$lock_path" "$site_root" || path_overlaps "$lock_path" "$app_root" || path_overlaps "$lock_path" "$incident_prefix"; then fatal "Rollback lock overlaps a protected path: $lock_path"; exit 1; fi',
    'if path_overlaps "$backup_dir" "$incident_prefix"; then fatal "Rollback paths overlap: $backup_dir / $incident_prefix"; exit 1; fi',
    'if path_overlaps "$site_root" "$app_root"; then fatal "Rollback paths overlap: $site_root / $app_root"; exit 1; fi',
    'if path_overlaps "$site_root" "$incident_prefix"; then fatal "Rollback paths overlap: $site_root / $incident_prefix"; exit 1; fi',
    'if path_overlaps "$app_root" "$incident_prefix"; then fatal "Rollback paths overlap: $app_root / $incident_prefix"; exit 1; fi',
    '[ -f "$backup_dir/index.html" ] || { fatal "Backup is missing index.html"; exit 1; }',
    '[ -d "$backup_dir/assets" ] || { fatal "Backup is missing assets"; exit 1; }',
    '[ -d "$backup_dir/server" ] || { fatal "Backup is missing server"; exit 1; }',
    'backup_module_sample="$(find -P "$backup_dir/server" -maxdepth 1 -type f ! -name \'database.db*\' -name \'*.mjs\' -print -quit)"',
    '[ -n "$backup_module_sample" ] || { fatal "Backup server has no .mjs modules"; exit 1; }',
    '[ -d "$site_root" ] || { fatal "Site root is missing: $site_root"; exit 1; }',
    'systemctl is-active --quiet -- "$service_name" || { fatal "Service is not initially active: $service_name"; exit 1; }',
    '',
    'incident_dir="$(mktemp -d "${incident_prefix}.XXXXXXXX")" || { fatal "Unable to allocate incident directory"; exit 1; }',
    'printf \'%s\\n\' "$incident_dir"',
    'static_incident="$incident_dir/site"',
    'server_incident="$incident_dir/server"',
    'mkdir -p -- "$static_incident" "$server_incident"',
    'file_manifest "$backup_dir" "$incident_dir/backup-static.manifest" static || exit 1',
    'file_manifest "$backup_dir/server" "$incident_dir/backup-modules.manifest" modules || exit 1',
    'file_manifest "$site_root" "$incident_dir/live-static-before.manifest" static || exit 1',
    'file_manifest "$server_root" "$incident_dir/live-modules-before.manifest" modules || exit 1',
    'rsync -a -- "$site_root"/ "$static_incident"/ || { fatal "Unable to snapshot static files"; exit 1; }',
    'trap rollback_exit_handler EXIT',
    'service_stopped=1',
    'systemctl stop -- "$service_name" || { fatal "Unable to stop service: $service_name"; exit 1; }',
    'rsync -a -- "$server_root"/ "$server_incident"/ || { fatal "Unable to snapshot server files"; exit 1; }',
    'snapshot_ready=1',
    'database_manifest "$server_incident" "$incident_dir/database-incident.manifest" || exit 1',
    'database_manifest "$server_root" "$incident_dir/database-before.manifest" || exit 1',
    'compare_manifest "$incident_dir/database-incident.manifest" "$incident_dir/database-before.manifest" || { rollback_db_failure=1; exit 1; }',
    'restore_static "$backup_dir" || { fatal "Static restore failed"; exit 1; }',
    'restore_modules "$backup_dir/server" || { fatal "Module restore failed"; exit 1; }',
    'database_manifest "$server_root" "$incident_dir/database-after-restore.manifest" || { rollback_db_failure=1; exit 1; }',
    'compare_manifest "$incident_dir/database-incident.manifest" "$incident_dir/database-after-restore.manifest" || { rollback_db_failure=1; exit 1; }',
    'file_manifest "$backup_dir" "$incident_dir/backup-static-after.manifest" static || exit 1',
    'file_manifest "$backup_dir/server" "$incident_dir/backup-modules-after.manifest" modules || exit 1',
    'compare_manifest "$incident_dir/backup-static.manifest" "$incident_dir/backup-static-after.manifest" || exit 1',
    'compare_manifest "$incident_dir/backup-modules.manifest" "$incident_dir/backup-modules-after.manifest" || exit 1',
    'file_manifest "$site_root" "$incident_dir/live-static-after.manifest" static || exit 1',
    'file_manifest "$server_root" "$incident_dir/live-modules-after.manifest" modules || exit 1',
    'compare_manifest "$incident_dir/backup-static-after.manifest" "$incident_dir/live-static-after.manifest" || exit 1',
    'compare_manifest "$incident_dir/backup-modules-after.manifest" "$incident_dir/live-modules-after.manifest" || exit 1',
    'if ! quick_check_before="$(timeout 15s sqlite3 "$server_root/database.db" \'PRAGMA quick_check;\')"; then',
    '  rollback_db_failure=1',
    '  fatal "SQLite quick_check failed before service start"',
    '  exit 1',
    'fi',
    '[ "$quick_check_before" = "ok" ] || { rollback_db_failure=1; fatal "SQLite quick_check was not ok before service start: $quick_check_before"; exit 1; }',
    'systemctl start -- "$service_name" || { fatal "Service restart failed: $service_name"; exit 1; }',
    'service_stopped=0',
    'systemctl is-active --quiet -- "$service_name" || { fatal "Service is not active after restart: $service_name"; exit 1; }',
    'if ! compare_main_database_hash; then',
    '  rollback_db_failure=1',
    '  fatal "Live database changed after service restart; incident: $incident_dir"',
    '  exit 1',
    'fi',
    'if ! quick_check_after="$(timeout 15s sqlite3 "$server_root/database.db" \'PRAGMA quick_check;\')"; then',
    '  rollback_db_failure=1',
    '  fatal "SQLite quick_check failed after service restart"',
    '  exit 1',
    'fi',
    '[ "$quick_check_after" = "ok" ] || { rollback_db_failure=1; fatal "SQLite quick_check was not ok after service restart: $quick_check_after"; exit 1; }',
    'wait_for_http_status "$healthcheck_url" 200 "Static health" || exit 1',
    'wait_for_http_status "$api_healthcheck_url" 401 "API health" || exit 1',
    'trap - EXIT',
    'exit 0',
  ].join('\n')
}

export function parseRollbackArgs(argv) {
  if (!Array.isArray(argv)) {
    throw new Error('Rollback arguments must be an array.')
  }

  let backupDir
  let dryRun = false
  let help = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--backup') {
      if (backupDir !== undefined) {
        throw new Error('Unknown argument: duplicate --backup.')
      }
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--backup requires an absolute POSIX path.')
      }
      backupDir = assertRemotePath(value, 'backupDir')
      index += 1
    } else if (argument === '--dry-run') {
      if (dryRun) {
        throw new Error('Unknown argument: duplicate --dry-run.')
      }
      dryRun = true
    } else if (argument === '--help' || argument === '-h') {
      help = true
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!help && backupDir === undefined) {
    throw new Error('--backup is required.')
  }
  return { backupDir, dryRun, help }
}

export function runRollback({
  argv = process.argv.slice(2),
  config,
  env = process.env,
  incidentBase,
  executor = (command) => execFileSync(command.file, command.args, { stdio: 'inherit' }),
  log = (line) => console.log(line),
} = {}) {
  const options = parseRollbackArgs(argv)
  if (options.help) {
    log(HELP_TEXT)
    return { executed: false, help: true }
  }

  const normalized = normalizeConfig(config ?? configFromEnv(env))
  const remoteScript = buildRollbackRemoteScript(
    normalized,
    options.backupDir,
    incidentBase ?? normalized.incidentBase,
  )
  assertDatabaseExclusions(remoteScript)
  const invocation = createSshInvocation(normalized.sshTarget, remoteScript)
  log(`${options.dryRun ? '[dry-run] $' : '$'} ${invocation.display}`)

  if (options.dryRun) {
    return { executed: false, invocation }
  }

  try {
    executor(invocation)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Rollback command failed: ${message}`)
  }
  return { executed: true, invocation }
}

export function main(argv = process.argv.slice(2)) {
  try {
    runRollback({ argv })
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    console.error(HELP_TEXT)
    return 1
  }
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMainModule) {
  process.exitCode = main()
}
