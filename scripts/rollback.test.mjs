import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONFIG,
  assertDatabaseExclusions,
  assertMatchingDatabaseHashes,
  buildRollbackRemoteScript,
  configFromEnv,
  parseRollbackArgs,
  runRollback,
} from './rollback.mjs'

const backupDir = '/root/cargo_project-backup-20260804-084101'
const incidentBase = '/root/cargo_project-incident-test'
const config = {
  ...DEFAULT_CONFIG,
  healthcheckUrl: 'http://127.0.0.1/',
}

function makeScript(overrides = {}) {
  return buildRollbackRemoteScript({ ...config, ...overrides }, backupDir, incidentBase)
}

function executeGeneratedHashVerifier(incidentHash, liveHash) {
  const script = makeScript()
  const startMarker = '  if ! incident_hash_line="$(sha256sum -b -- "$server_incident/database.db")"; then'
  const endMarker = '\n}\n\nrestore_static()'
  const start = script.indexOf(startMarker)
  const end = script.indexOf(endMarker, start)
  expect(start, 'generated hash verifier start').toBeGreaterThanOrEqual(0)
  expect(end, 'generated hash verifier end').toBeGreaterThan(start)
  const verifier = script.slice(start, end)
  const shellScript = [
    'server_incident=/tmp/rollback-incident',
    'server_root=/tmp/rollback-live',
    'sha256sum() {',
    '  while [ "$1" = -b ] || [ "$1" = -- ]; do shift; done',
    '  case "$1" in',
    `    "$server_incident/database.db") printf '%s  %s\\n' '${incidentHash}' "$1" ;;`,
    `    "$server_root/database.db") printf '%s  %s\\n' '${liveHash}' "$1" ;;`,
    '    *) return 1 ;;',
    '  esac',
    '}',
    'verify_hash() {',
    verifier,
    '}',
    'verify_hash',
  ].join('\n')

  try {
    execFileSync('bash', ['-c', shellScript], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stderr: '' }
  } catch (error) {
    return {
      status: error.status,
      stderr: String(error.stderr ?? ''),
    }
  }
}

let offlineCase = 0

function offlineFixture({
  failRsyncOn = '',
  failStart = false,
  failSqlite = false,
  failChown = false,
  runTwice = false,
  corruptStatic = false,
  overlap = false,
  insecureEntry = false,
  prepopulateLock = false,
  lockKind = '',
  insecureParent = false,
  nestedBackup = false,
} = {}) {
  const base = `/tmp/cargo-rollback-offline-${process.pid}-${offlineCase++}`
  const offlineConfig = {
    ...config,
    backupBase: `${base}/backup-prefix`,
    siteRoot: overlap ? `${base}/backup-prefix-001` : `${base}/site`,
    appRoot: `${base}/app`,
    incidentBase: insecureParent ? `${base}/incident-parent/incident` : `${base}/incident`,
    lockPath: `${base}/lock/cargo-project-rollback.lock`,
  }
  const offlineBackup = nestedBackup
    ? `${base}/backup-prefix-001/intermediate/backup-prefix-002`
    : `${base}/backup-prefix-001`
  const generated = buildRollbackRemoteScript(offlineConfig, offlineBackup, offlineConfig.incidentBase)
  const fake = (name, lines) => [
    `cat > "$fake_bin/${name}" <<'FAKE_${name}'`,
    ...lines,
    `FAKE_${name}`,
    `chmod +x "$fake_bin/${name}"`,
  ]
  const shellScript = [
    'set -e',
    `base=${base}`,
    'rm -rf "$base"',
    'mkdir -p "$base/backup-prefix-001/assets" "$base/backup-prefix-001/server" "$base/site/assets" "$base/site/server" "$base/app/server" "$base/lock" "$base/incident" "$base/incident-parent" "$base/bin"',
    nestedBackup
      ? 'backup_fixture_root="$base/backup-prefix-001/intermediate/backup-prefix-002"'
      : 'backup_fixture_root="$base/backup-prefix-001"',
    nestedBackup ? 'mkdir -p "$backup_fixture_root/assets" "$backup_fixture_root/server"' : '',
    prepopulateLock
      ? 'printf LOCK_SENTINEL > "$base/lock/cargo-project-rollback.lock"'
      : '',
    lockKind === 'fifo'
      ? 'mkfifo "$base/lock/cargo-project-rollback.lock"'
      : lockKind === 'directory'
        ? 'mkdir -p "$base/lock/cargo-project-rollback.lock"'
        : '',
    'fake_bin="$base/bin"',
    'state="$base/state"',
    'printf active > "$state"',
    'rsync_count="$base/rsync.count"',
    'metadata_log="$base/metadata.log"',
    'metadata_violation="$base/metadata.violation"',
    ...fake('flock', ['#!/bin/sh', 'exit 0']),
    ...fake('realpath', [
      '#!/bin/sh',
      'result=',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in -e|--) shift ;; *) result="$1"; shift ;; esac',
      'done',
      'printf \'%s\\n\' "$result"',
    ]),
    ...fake('stat', [
      '#!/bin/sh',
      'format=',
      'path=',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in -c) format="$2"; shift 2 ;; --) shift ;; *) path="$1"; shift ;; esac',
      'done',
      'if [ "${FAKE_NESTED_PARENT:-0}" = 1 ] && [ "$path" = "$FAKE_NESTED_PARENT_PATH" ]; then',
      '  case "$format" in %u:%g) printf \'0:0\\n\' ;; %A) printf \'drwxrwxrwx\\n\' ;; *) printf \'0:0:-rwxrwxrwx\\n\' ;; esac',
      '  exit 0',
      'fi',
      'if [ "${FAKE_INSECURE_PARENT:-0}" = 1 ] && [ "$path" = "$FAKE_INSECURE_PARENT_PATH" ]; then',
      '  case "$format" in %u:%g) printf \'0:0\\n\' ;; %A) printf \'drwxrwxrwx\\n\' ;; *) printf \'0:0:-rwxrwxrwx\\n\' ;; esac',
      '  exit 0',
      'fi',
      'if [ "${FAKE_INSECURE_ENTRY:-0}" = 1 ] && [ "$path" = "$FAKE_INSECURE_PATH" ]; then',
      '  case "$format" in %u:%g) printf \'1000:1000\\n\' ;; %A) printf \'drwxrwxrwx\\n\' ;; *) printf \'1000:1000:-rwxrwxrwx\\n\' ;; esac',
      '  exit 0',
      'fi',
      'case "$format" in',
      '  %u:%g) printf \'0:0\\n\' ;;',
      '  %A) printf \'drwxr-xr-x\\n\' ;;',
      '  *) printf \'0:0:-rw-r--r--\\n\' ;;',
      'esac',
    ]),
    ...fake('systemctl', [
      '#!/bin/sh',
      'command="$1"',
      'case "$command" in',
      '  is-active) [ "$(cat "$FAKE_STATE")" = active ] ;;',
      '  stop) printf stopped > "$FAKE_STATE" ;;',
      '  start)',
      '    [ "${FAKE_START_FAIL:-0}" = 1 ] && exit 1',
      '    printf active > "$FAKE_STATE" ;;',
      '  *) exit 2 ;;',
      'esac',
    ]),
    ...fake('rsync', [
      '#!/bin/sh',
      '[ -f "$FAKE_RSYNC_COUNT" ] && count=$(cat "$FAKE_RSYNC_COUNT")',
      'count=$((count + 1))',
      'printf \'%s\\n\' "$count" > "$FAKE_RSYNC_COUNT"',
      '[ "${FAKE_RSYNC_FAIL_ON:-}" = "$count" ] && exit 23',
      'src=',
      'dest=',
      'after_options=0',
      'for arg do',
      '  if [ "$after_options" = 1 ]; then',
      '    [ -n "$src" ] && dest="${arg%/}" || src="${arg%/}"',
      '  fi',
      '  [ "$arg" = -- ] && after_options=1',
      'done',
      '[ -n "$src" ] && [ -n "$dest" ] || exit 2',
      'mkdir -p "$dest"',
      'db_family_hidden=0',
      'case "$*" in *"--filter=hide /database.db"*) db_family_hidden=1 ;; esac',
      'case "$*" in',
      '  *--include=/*.mjs*)',
      '    case "$dest" in */incident.*/*) cp -a "$src"/. "$dest"/ ;; *)',
      '      if [ "$db_family_hidden" = 1 ]; then find "$dest" -maxdepth 1 -type f -name \'*.mjs\' ! -name \'database.db*\' -delete; else find "$dest" -maxdepth 1 -type f -name \'*.mjs\' -delete; fi',
      '      for file in "$src"/*.mjs; do',
      '        [ -e "$file" ] || continue',
      '        file_name="$(basename "$file")"',
      '        case "$file_name" in',
      '          database.db*) [ "$db_family_hidden" = 1 ] && continue ;;',
      '        esac',
      '        cp -a "$file" "$dest"/',
      '      done',
      '    esac ;;',
      '  *)',
      '    case "$dest" in */incident.*/*) cp -a "$src"/. "$dest"/ ;; *)',
      '      find "$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +',
      '      for file in "$src"/* "$src"/.[!.]*; do [ -e "$file" ] || continue; [ "$(basename "$file")" = server ] && continue; cp -a "$file" "$dest"/; done',
      '      if [ "${FAKE_STATIC_CORRUPT:-0}" = 1 ] && [ "$count" = 3 ]; then printf BROKEN > "$dest/index.html"; touch -r "$src/index.html" "$dest/index.html"; fi',
      '    esac ;;',
      'esac',
    ]),
    ...fake('chown', [
      '#!/bin/sh',
      'printf \'chown %s\\n\' "$*" >> "$FAKE_METADATA_LOG"',
      '[ "${FAKE_CHOWN_FAIL:-0}" = 1 ] && exit 23',
      'case "$*" in *database.db*|*.mjs*|*/app/server*) : > "$FAKE_METADATA_VIOLATION" ;; esac',
    ]),
    ...fake('chmod', [
      '#!/bin/sh',
      'printf \'chmod %s\\n\' "$*" >> "$FAKE_METADATA_LOG"',
      'case "$*" in *database.db*|*.mjs*|*/app/server*) : > "$FAKE_METADATA_VIOLATION" ;; esac',
    ]),
    ...fake('sqlite3', [
      '#!/bin/sh',
      '[ "${FAKE_SQLITE_FAIL:-0}" = 1 ] && exit 1',
      'printf \'%s\\n\' "${FAKE_SQLITE_OUTPUT:-ok}"',
    ]),
    ...fake('timeout', ['#!/bin/sh', 'shift', 'exec "$@"']),
    ...fake('curl', [
      '#!/bin/sh',
      'case "$*" in *api/import-templates*) printf 401 ;; *) printf 200 ;; esac',
    ]),
    'printf BACKUP > "$backup_fixture_root/index.html"',
    'printf BACKUP > "$backup_fixture_root/assets/app.js"',
    'printf MODULE_A > "$backup_fixture_root/server/a.mjs"',
    'printf MODULE_B > "$backup_fixture_root/server/b.mjs"',
    'printf BACKUP_DB_EXTRA > "$backup_fixture_root/server/database.db-extra.mjs"',
    'printf OLD!!! > "$base/site/index.html"',
    'printf OLD!!! > "$base/site/assets/app.js"',
    'printf STALE > "$base/site/server/stale.js"',
    'printf OLD_MODULE > "$base/app/server/a.mjs"',
    'printf OLD_STALE > "$base/app/server/stale.mjs"',
    'printf LIVE_DB_EXTRA_MODULE > "$base/app/server/database.db-extra.mjs"',
    'printf PACKAGE_OLD > "$base/app/package.json"',
    'for db_name in database.db database.db-wal database.db-shm database.db-journal database.db-extra; do printf "LIVE_$db_name" > "$base/app/server/$db_name"; done',
    'export PATH="$fake_bin:$PATH"',
    `export FAKE_STATE="$state" FAKE_RSYNC_COUNT="$rsync_count" FAKE_METADATA_LOG="$metadata_log" FAKE_METADATA_VIOLATION="$metadata_violation" FAKE_RSYNC_FAIL_ON=${failRsyncOn} FAKE_START_FAIL=${failStart ? 1 : 0} FAKE_SQLITE_FAIL=${failSqlite ? 1 : 0} FAKE_RUN_TWICE=${runTwice ? 1 : 0} FAKE_STATIC_CORRUPT=${corruptStatic ? 1 : 0} FAKE_INSECURE_ENTRY=${insecureEntry ? 1 : 0} FAKE_INSECURE_PARENT=${insecureParent ? 1 : 0} FAKE_INSECURE_PARENT_PATH="$base" FAKE_NESTED_PARENT=${nestedBackup ? 1 : 0} FAKE_NESTED_PARENT_PATH="$base/backup-prefix-001/intermediate" FAKE_CHOWN_FAIL=${failChown ? 1 : 0} FAKE_INSECURE_PATH="$base/backup-prefix-001/server/a.mjs"`, 
    'set +e',
    '(',
    generated,
    ') > "$base/run.out" 2> "$base/run.err"',
    'run_status=$?',
    'run_status_two=0',
    '[ "${FAKE_RUN_TWICE:-0}" = 1 ] && { set +e; (',
    generated,
    ') > "$base/run-two.out" 2> "$base/run-two.err"; run_status_two=$?; set -e; }',
    'set -e',
    'printf \'RUN_STATUS=%s\\n\' "$run_status"',
    'printf \'RUN_STATE=%s\\n\' "$(cat "$state")"',
    'printf \'RUN_INCIDENT=%s\\n\' "$(sed -n \'1p\' "$base/run.out" 2>/dev/null || true)"',
    'printf \'RUN_STATUS_TWO=%s\\n\' "$run_status_two"',
    'printf \'RUN_INCIDENT_TWO=%s\\n\' "$(sed -n \'1p\' "$base/run-two.out" 2>/dev/null || true)"',
    'printf \'RUN_STDERR=%s\\n\' "$(tr \'\\n\' \'|\' < "$base/run.err" 2>/dev/null || true)"',
    'printf \'DB_MAIN=%s\\n\' "$(cat "$base/app/server/database.db")"',
    'printf \'DB_WAL=%s\\n\' "$(cat "$base/app/server/database.db-wal")"',
    'printf \'DB_SHM=%s\\n\' "$(cat "$base/app/server/database.db-shm")"',
    'printf \'DB_JOURNAL=%s\\n\' "$(cat "$base/app/server/database.db-journal")"',
    'printf \'DB_EXTRA=%s\\n\' "$(cat "$base/app/server/database.db-extra")"',
    'printf \'STATIC_INDEX=%s\\n\' "$(cat "$base/site/index.html")"',
    'printf \'MODULE_A=%s\\n\' "$(cat "$base/app/server/a.mjs" 2>/dev/null || true)"',
    'printf \'MODULE_B=%s\\n\' "$(cat "$base/app/server/b.mjs" 2>/dev/null || true)"',
    'printf \'MODULE_DB_EXTRA=%s\\n\' "$(cat "$base/app/server/database.db-extra.mjs" 2>/dev/null || true)"',
    'if [ -f "$base/lock/cargo-project-rollback.lock" ]; then printf \'LOCK_CONTENT=%s\\n\' "$(cat "$base/lock/cargo-project-rollback.lock")"; fi',
    'printf \'INCIDENT_MANIFESTS=%s\\n\' "$(test -n "$(find "$base" -path \'*/incident.*/*.manifest\' -type f -print -quit)" && echo yes || echo no)"',
    'printf \'STATIC_STALE=%s\\n\' "$(test ! -e "$base/site/server/stale.js" && echo yes || echo no)"',
    'printf \'MODULE_STALE=%s\\n\' "$(test ! -e "$base/app/server/stale.mjs" && echo yes || echo no)"',
    'printf \'PACKAGE=%s\\n\' "$(cat "$base/app/package.json")"',
    'printf \'METADATA_VIOLATION=%s\\n\' "$(test ! -e "$metadata_violation" && echo no || echo yes)"',
  ].join('\n')
  let result
  try {
    result = execFileSync('bash', ['-c', 'bash -s'], {
      input: shellScript,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    result = `${String(error.stdout ?? '')}\n${String(error.stderr ?? '')}`
  }
  const fields = Object.fromEntries(
    result
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
  return { base, script: generated, output: result, fields }
}

describe('rollback remote script', () => {
  it('requires the backup shape and protects every SQLite sidecar exactly', () => {
    const script = makeScript()

    expect(script).toContain('set -e')
    expect(script).toContain('[ -f "$backup_dir/index.html" ]')
    expect(script).toContain('[ -d "$backup_dir/assets" ]')
    expect(script).toContain('[ -d "$backup_dir/server" ]')
    expect(script).toContain('backup_dir_parent="$(dirname -- "$backup_dir")"')
    expect(script).toContain('[ "$backup_dir_parent" = "$backup_base_parent" ]')
    expect(assertDatabaseExclusions(script)).toBe(true)
    expect(script.match(/--exclude=database\.db(?:-shm|-wal|-journal)?/g)).toEqual([
      '--exclude=database.db',
      '--exclude=database.db-shm',
      '--exclude=database.db-wal',
      '--exclude=database.db-journal',
    ])
  })

  it('protects the complete database family before module include and excludes it from manifests', () => {
    const script = makeScript()
    const start = script.indexOf('restore_modules() {')
    const end = script.indexOf('\n}\n\nrollback_exit_handler()', start)
    const restore = script.slice(start, end)
    const include = restore.indexOf('--include=\'/*.mjs\'')

    expect(include).toBeGreaterThanOrEqual(0)
    for (const filter of [
      '--filter=\'hide /database.db*\'',
      '--filter=\'protect /database.db*\'',
      '--exclude=database.db',
      '--exclude=database.db-shm',
      '--exclude=database.db-wal',
      '--exclude=database.db-journal',
    ]) {
      expect(restore.indexOf(filter)).toBeGreaterThanOrEqual(0)
      expect(restore.indexOf(filter)).toBeLessThan(include)
    }
    expect(script).toContain("! -name 'database.db*' -name '*.mjs'")
    expect(script).toContain(
      "backup_module_sample=\"$(find -P \"$backup_dir/server\" -maxdepth 1 -type f ! -name 'database.db*' -name '*.mjs' -print -quit)\"",
    )
  })

  it('rejects a missing, broadened, or unprotected database exclusion', () => {
    const script = makeScript()

    expect(() => assertDatabaseExclusions(script.replace('    --exclude=database.db-journal \\\n', ''))).toThrow(
      /database exclusions/i,
    )
    expect(() =>
      assertDatabaseExclusions(script.replace('--exclude=database.db-journal', '--exclude=database.db*')),
    ).toThrow(/database exclusions/i)
  })

  it('allocates and prints one unique retained incident directory without removal', () => {
    const script = makeScript()

    expect(script.match(/mktemp -d/g)).toHaveLength(1)
    expect(script).toContain('incident_dir="$(mktemp -d "${incident_prefix}.XXXXXXXX")"')
    expect(script).toContain('printf \'%s\\n\' "$incident_dir"')
    expect(script).not.toMatch(/\brm(?:\s|$)/)
    expect(script).not.toContain('mkdir -p "$incident_base"')
  })

  it('orders preflight, snapshots, module-only restore, gates, and trap recovery', () => {
    const script = makeScript()
    const position = (text, start = 0) => {
      const found = script.indexOf(text, start)
      expect(found, `missing marker: ${text}`).toBeGreaterThanOrEqual(0)
      return found
    }
    const active = position('systemctl is-active --quiet -- "$service_name"', script.indexOf('backup_module_sample'))
    const allocation = position('incident_dir="$(mktemp -d')
    const staticSnapshot = position('rsync -a -- "$site_root"/ "$static_incident"/', allocation)
    const trap = position('trap rollback_exit_handler EXIT', staticSnapshot)
    const stop = position('systemctl stop -- "$service_name"', trap)
    const serverSnapshot = position('rsync -a -- "$server_root"/ "$server_incident"/', stop)
    const staticRestore = position('restore_static "$backup_dir"', serverSnapshot)
    const moduleRestore = position('restore_modules "$backup_dir/server"', staticRestore)
    const dbAfter = position('database_manifest "$server_root" "$incident_dir/database-after-restore.manifest"')
    const staticManifest = position('file_manifest "$site_root" "$incident_dir/live-static-after.manifest"')
    const quickBefore = position('quick_check_before="$(timeout 15s sqlite3')
    const restart = position('systemctl start -- "$service_name"', quickBefore)
    const activeAfter = position('systemctl is-active --quiet -- "$service_name"', restart)
    const hash = position('if ! compare_main_database_hash; then', activeAfter)
    const quickAfter = position('quick_check_after="$(timeout 15s sqlite3', hash)
    const staticHealth = position('static_status="$(curl --connect-timeout 5', quickAfter)
    const apiHealth = position('api_status="$(curl --connect-timeout 5', staticHealth)
    const clearTrap = position('trap - EXIT', apiHealth)

    expect([
      active,
      allocation,
      staticSnapshot,
      trap,
      stop,
      serverSnapshot,
      staticRestore,
      moduleRestore,
      dbAfter,
      staticManifest,
      quickBefore,
      restart,
      activeAfter,
      hash,
      quickAfter,
      staticHealth,
      apiHealth,
      clearTrap,
    ]).toEqual([
      active,
      allocation,
      staticSnapshot,
      trap,
      stop,
      serverSnapshot,
      staticRestore,
      moduleRestore,
      dbAfter,
      staticManifest,
      quickBefore,
      restart,
      activeAfter,
      hash,
      quickAfter,
      staticHealth,
      apiHealth,
      clearTrap,
    ].sort((left, right) => left - right))
  })

  it('restores static files with anchored delete-excluded server boundary', () => {
    const script = makeScript()
    const start = script.indexOf('restore_static() {')
    const end = script.indexOf('\n}\n\nrestore_modules()', start)
    const restore = script.slice(start, end)

    expect(script).toContain('--exclude=/server/')
    expect(script).toContain('--delete-excluded')
    expect(restore).not.toMatch(/database\.db/)
  })


  it('uses the fixed trusted lock path with non-truncating validated acquisition before source checks', () => {
    const script = makeScript()
    const lockOpen = script.indexOf('exec 9>>"$lock_path"')
    const sourceValidation = script.indexOf('backup_base_parent=')

    expect(DEFAULT_CONFIG.lockPath).toBe('/run/cargo-project-rollback.lock')
    expect(script).toContain('umask 077')
    expect(script).toContain('lock_path=/run/cargo-project-rollback.lock')
    expect(lockOpen).toBeGreaterThanOrEqual(0)
    expect(lockOpen).toBeLessThan(sourceValidation)
    expect(script).toContain('if [ -e "$lock_path" ] || [ -L "$lock_path" ]; then')
    expect(script).toContain('[ -f "$secure_lock_path" ]')
    expect(script).toContain('secure_metadata "$secure_lock_path" "$secure_lock_label"')
    expect(script).not.toContain('exec 9>"$lock_path"')
    expect(() => makeScript({ lockPath: '/tmp/rollback.lock' })).toThrow(/basename/i)
  })
  it('requires generated SHA-256 equality and explicit mismatch output', () => {
    const hash = 'a'.repeat(64)
    const script = makeScript()

    expect(assertMatchingDatabaseHashes(hash, hash)).toBe(true)
    expect(() => assertMatchingDatabaseHashes(hash, 'b'.repeat(64))).toThrow(/database hash mismatch/i)
    expect(script).toContain('if ! incident_hash_line="$(sha256sum -b -- "$server_incident/database.db")"; then')
    expect(script).toContain('incident_db_hash="${incident_hash_line%% *}"')
    expect(script).toContain('live_db_hash="${live_hash_line%% *}"')
    expect(script).toContain('if [ "$incident_db_hash" != "$live_db_hash" ]; then')
    expect(script).toContain(
      "printf 'Database hash mismatch: incident=%s live=%s\\n' \"$incident_db_hash\" \"$live_db_hash\" >&2",
    )
  })

  it('executes generated hash equality and mismatch behavior offline', () => {
    const incidentHash = 'a'.repeat(64)
    const liveHash = 'b'.repeat(64)

    const equal = executeGeneratedHashVerifier(incidentHash, incidentHash)
    expect(equal.status, equal.stderr).toBe(0)
    expect(equal.stderr).toBe('')

    const mismatch = executeGeneratedHashVerifier(incidentHash, liveHash)
    expect(mismatch.status).not.toBe(0)
    expect(mismatch.stderr).toContain(
      `Database hash mismatch: incident=${incidentHash} live=${liveHash}`,
    )
  })

  it('executes the full success flow against an offline temporary filesystem', () => {
    const result = offlineFixture({ runTwice: true })
    expect(result.fields.RUN_STATUS).toBe('0')
    expect(result.fields.RUN_STATUS_TWO).toBe('0')
    expect(result.fields.RUN_INCIDENT).not.toBe('')
    expect(result.fields.RUN_INCIDENT_TWO).not.toBe('')
    expect(result.fields.RUN_INCIDENT_TWO).not.toBe(result.fields.RUN_INCIDENT)
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.DB_MAIN).toBe('LIVE_database.db')
    expect(result.fields.DB_WAL).toBe('LIVE_database.db-wal')
    expect(result.fields.DB_SHM).toBe('LIVE_database.db-shm')
    expect(result.fields.DB_JOURNAL).toBe('LIVE_database.db-journal')
    expect(result.fields.DB_EXTRA).toBe('LIVE_database.db-extra')
    expect(result.fields.STATIC_INDEX).toBe('BACKUP')
    expect(result.fields.MODULE_A).toBe('MODULE_A')
    expect(result.fields.MODULE_B).toBe('MODULE_B')
    expect(result.fields.MODULE_DB_EXTRA).toBe('LIVE_DB_EXTRA_MODULE')
    expect(result.fields.STATIC_STALE).toBe('yes')
    expect(result.fields.MODULE_STALE).toBe('yes')
    expect(result.fields.PACKAGE).toBe('PACKAGE_OLD')
    expect(result.fields.METADATA_VIOLATION).toBe('no')
    expect(result.fields.INCIDENT_MANIFESTS).toBe('yes')
    expect(result.output).not.toContain('ROLLBACK FATAL')
  }, 30000)

  it('preserves an existing regular lock sentinel without truncation', () => {
    const result = offlineFixture({ prepopulateLock: true })

    expect(result.fields.RUN_STATUS).toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.LOCK_CONTENT).toBe('LOCK_SENTINEL')
  }, 30000)

  it.each(['fifo', 'directory'])('rejects a non-regular lock target before service mutation: %s', (lockKind) => {
    const result = offlineFixture({ lockKind })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.RUN_STDERR).toContain('regular file')
  }, 30000)

  it('rejects a writable backup-base parent before trusting backup contents', () => {
    const result = offlineFixture({ insecureParent: true })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.RUN_STDERR).toContain('group/world writable')
  }, 30000)

  it('rejects nested backup paths with an unchecked intermediate before service or files', () => {
    const result = offlineFixture({ nestedBackup: true })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.RUN_STDERR).toContain('direct child')
  }, 30000)

  it('detects same-size static corruption through manifest comparison and recovers', () => {
    const result = offlineFixture({ corruptStatic: true })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.STATIC_INDEX).toBe('OLD!!!')
    expect(result.fields.RUN_STDERR).toContain('Manifest mismatch')
    expect(result.fields.RUN_STDERR).toContain('Rollback failed; retained incident:')
  }, 30000)

  it('rejects source/destination overlap before mutating service or files', () => {
    const result = offlineFixture({ overlap: true })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.RUN_STDERR).toContain('Rollback paths overlap')
  }, 30000)

  it('restarts the original service when server incident snapshot fails', () => {
    const result = offlineFixture({ failRsyncOn: 2 })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.STATIC_INDEX).toBe('OLD!!!')
    expect(result.fields.MODULE_A).toBe('OLD_MODULE')
    expect(result.fields.RUN_STDERR).toContain('server incident snapshot failed')
  }, 30000)

  it('rejects insecure backup entries before stopping the service', () => {
    const result = offlineFixture({ insecureEntry: true })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.RUN_STDERR).toContain('root-owned')
  }, 30000)

  it('recovers the prior static/modules and restarts after an injected restore failure', () => {
    const result = offlineFixture({ failRsyncOn: 3 })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('active')
    expect(result.fields.DB_MAIN).toBe('LIVE_database.db')
    expect(result.fields.DB_JOURNAL).toBe('LIVE_database.db-journal')
    expect(result.fields.STATIC_INDEX).toBe('OLD!!!')
    expect(result.fields.MODULE_A).toBe('OLD_MODULE')
    expect(result.fields.MODULE_DB_EXTRA).toBe('LIVE_DB_EXTRA_MODULE')
    expect(result.fields.RUN_STDERR).toContain('Rollback failed; retained incident:')
  }, 30000)

  it('leaves service stopped when static ownership restore and recovery both fail', () => {
    const result = offlineFixture({ failChown: true })

    expect(result.fields.RUN_STATUS).not.toBe('0')
    expect(result.fields.RUN_STATE).toBe('stopped')
    expect(result.fields.RUN_STDERR).toContain('recovery restore failed')
    expect(result.fields.RUN_STDERR).toContain('incident:')
  }, 30000)

  it('leaves service stopped and reports incident on integrity failure or recovery restart failure', () => {
    const integrity = offlineFixture({ failSqlite: true })
    expect(integrity.fields.RUN_STATUS).not.toBe('0')
    expect(integrity.fields.RUN_STATE).toBe('stopped')
    expect(integrity.fields.DB_WAL).toBe('LIVE_database.db-wal')
    expect(integrity.fields.RUN_STDERR).toContain('database/integrity gate failed')
    expect(integrity.fields.RUN_STDERR).toContain('incident:')

    const restart = offlineFixture({ failRsyncOn: 3, failStart: true })
    expect(restart.fields.RUN_STATUS).not.toBe('0')
    expect(restart.fields.RUN_STATE).toBe('stopped')
    expect(restart.fields.RUN_STDERR).toContain('recovery restart failed')
  }, 30000)

  it('rejects root, traversal, overlap-prone, option, and URL-userinfo values', () => {
    expect(() => makeScript({ siteRoot: '/' })).toThrow(/non-root/i)
    expect(() => makeScript({ appRoot: '/opt/../cargo-server' })).toThrow(/non-root|traversal/i)
    expect(() => makeScript({ sshTarget: '-V' })).toThrow(/unsafe/i)
    expect(() => makeScript({ serviceName: '--help' })).toThrow(/unsafe/i)
    expect(() => makeScript({ owner: '-R' })).toThrow(/unsafe/i)
    expect(() => makeScript({ healthcheckUrl: 'http://user:pass@example.test/' })).toThrow(/userinfo/i)
    expect(makeScript()).toContain('path_overlaps')
  })

  it('checks health, permissions, metadata boundaries, and package preservation', () => {
    const script = makeScript()

    expect(script).toContain('chown -R -- "$owner" "$site_root"')
    expect(script).toContain('chmod -R a+rX -- "$site_root"')
    expect(script).not.toContain('module_file')
    expect(script).not.toMatch(/(?:chown|chmod)[^\n]*(?:server_root|database\.db)/)
    expect(script).toContain('for required_command in cmp chmod chown curl find flock mkdir mktemp realpath rsync sha256sum sort sqlite3 stat systemctl timeout dirname basename; do')
    expect(script).toContain("--filter='protect /database.db*'")
    expect(script).toContain('curl --connect-timeout 5 --max-time 15')
    expect(script).toContain("sqlite3 \"$server_root/database.db\" 'PRAGMA quick_check;'")
    expect(script).not.toMatch(/package(?:-lock)?\.json/)
  })
})

describe('rollback command runner', () => {
  it('prints the full SSH invocation in dry-run mode without calling the executor', () => {
    const calls = []
    const output = []
    const result = runRollback({
      argv: ['--backup', backupDir, '--dry-run'],
      executor: (...args) => calls.push(args),
      log: (line) => output.push(line),
      config,
      incidentBase,
    })

    expect(calls).toEqual([])
    expect(result.executed).toBe(false)
    expect(result.invocation.file).toBe('ssh')
    expect(result.invocation.args).toEqual(['cargo-server', expect.any(String)])
    expect(output).toHaveLength(1)
    expect(output[0]).toContain('ssh cargo-server')
    expect(output[0]).toContain('mktemp -d')
    expect(output[0]).toContain('--exclude=database.db-journal')
    expect(output[0]).toContain('PRAGMA quick_check')
  })

  it('rejects missing, duplicate, relative, root, traversal, positional, and unknown CLI arguments', () => {
    expect(() => parseRollbackArgs([])).toThrow(/--backup/i)
    expect(() => parseRollbackArgs(['--backup'])).toThrow(/--backup/i)
    expect(() => parseRollbackArgs(['--backup', 'relative-backup'])).toThrow(/absolute POSIX/i)
    expect(() => parseRollbackArgs(['--backup', '/'])).toThrow(/non-root/i)
    expect(() => parseRollbackArgs(['--backup', '/tmp/../backup'])).toThrow(/traversal/i)
    expect(() => parseRollbackArgs(['--backup', '/tmp/backup; touch /tmp/pwned'])).toThrow(/unsafe/i)
    expect(() => parseRollbackArgs(['--backup', backupDir, '--backup', backupDir])).toThrow(/duplicate/i)
    expect(() => parseRollbackArgs(['--dry-run', '--dry-run'])).toThrow(/duplicate/i)
    expect(() => parseRollbackArgs(['--backup', backupDir, 'extra'])).toThrow(/unknown argument/i)
    expect(() => parseRollbackArgs(['--unknown', backupDir])).toThrow(/unknown argument/i)
    expect(() => parseRollbackArgs(null)).toThrow(/array/i)
    expect(parseRollbackArgs(['--help'])).toEqual({ backupDir: undefined, dryRun: false, help: true })
  })

  it('uses deployment environment defaults with explicit remote-user and backup-base precedence', () => {
    const env = {
      DEPLOY_REMOTE_USER: 'rollback@example.test',
      DEPLOY_SSH_HOST: 'ignored-host',
      DEPLOY_SITE_ROOT: '/srv/site',
      DEPLOY_APP_ROOT: '/srv/app',
      DEPLOY_SERVICE: 'rollback.service',
      DEPLOY_OWNER: 'deploy:deploy',
      DEPLOY_BACKUP_BASE: '/srv/backups/cargo',
      DEPLOY_HEALTHCHECK: 'https://health.example.test/',
      ROLLBACK_INCIDENT_BASE: '/srv/incident',
      ROLLBACK_LOCK_PATH: '/tmp/attacker.lock',
    }
    const derived = configFromEnv(env)
    const output = []
    const result = runRollback({
      argv: ['--backup', '/srv/backups/cargo-001', '--dry-run'],
      env,
      log: (line) => output.push(line),
    })
    const script = result.invocation.args[1]

    expect(derived.sshTarget).toBe('rollback@example.test')
    expect(result.invocation.args[0]).toBe('rollback@example.test')
    expect(script).toContain('backup_base=/srv/backups/cargo')
    expect(script).toContain('site_root=/srv/site')
    expect(script).toContain('app_root=/srv/app')
    expect(script).toContain('service_name=rollback.service')
    expect(script).toContain('owner=deploy:deploy')
    expect(script).toContain('healthcheck_url=https://health.example.test/')
    expect(script).toContain('api_healthcheck_url=http://127.0.0.1/api/import-templates')
    expect(script).toContain('incident_base=/srv/incident')
    expect(derived.lockPath).toBe(DEFAULT_CONFIG.lockPath)
    expect(script).toContain('lock_path=/run/cargo-project-rollback.lock')
    expect(output).toHaveLength(1)
  })
})
