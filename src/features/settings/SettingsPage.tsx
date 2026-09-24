import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Cloud, Download, FileUp, HardDrive, Info, LogOut, RefreshCw, Server, Share, ShieldCheck, Smartphone, Sparkles, Target, Trash2 } from 'lucide-react'
import type { AiHealth } from '../../../shared/ai'
import { AiConsentSheet } from '../../components/ai'
import { aiHealth, setAiConsent, type AiConsent } from '../../lib/ai'
import { db, DATA_TABLES, type DataTable } from '../../db/db'
import { useMeta, useProfile } from '../../db/hooks'
import { alive, notifyLocalChange, save } from '../../db/repo'
import { applyImport, buildBackupFile, deleteEverything, markBackedUp, planImport, type ImportPlan } from '../../db/backup'
import { Avatar, Group, IconTile, NavBar, Row, Section, Segmented, Toggle } from '../../components/ui'
import { formatWhen, relativeAge } from '../../lib/dates'
import { formatBytes, isIOS, isStandalone, isTouch, requestPersistence, squarePhoto, storageStatus } from '../../lib/platform'
import { getTheme, setTheme, type Theme } from '../../lib/theme'
import { toast } from '../../lib/toast'
import { cachedToken, forgetToken, GOOGLE_CLIENT_ID, prepareGoogle, requestToken } from '../../lib/google'
import { deleteDriveData, signOut, syncNow, useSyncStatus, type DriveLink } from '../../lib/sync'

const TABLE_LABELS: Record<DataTable, string> = {
  profile: 'Profile',
  injuries: 'Injuries',
  symptoms: 'Symptoms',
  measurements: 'Measurements',
  journal: 'Notes',
  exercises: 'Exercises',
  prescriptions: 'Plan',
  sessions: 'Sessions',
  documents: 'Documents',
  meals: 'Meals',
  savedMeals: 'Saved Meals',
  facts: 'Health Profile',
  water: 'Water',
  sleep: 'Sleep',
  activity: 'Activity',
}

const TILE_INSET = '3.625rem'

export function SettingsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [hash])

  return (
    <div className="space-y-7 pb-6">
      <NavBar title="Settings" back="/" />
      <ProfileSection />
      <Section>
        <Group inset={TILE_INSET}>
          <Row icon={<IconTile icon={Target} color="orange" />} title="Goals" subtitle="Protein, water, steps, sleep and weight" to="/goals" />
        </Group>
      </Section>
      <AppearanceSection />
      <DriveSection />
      <AiSection />
      <BackupSection />
      <RestoreSection />
      <StorageSection />
      <AboutSection />
      {import.meta.env.DEV && <DemoDataSection />}
      <DangerSection />
    </div>
  )
}

function ProfileSection() {
  const profile = useProfile()
  const [name, setName] = useState<string>()
  const value = name ?? profile?.name ?? ''
  const initial = value.trim()[0]?.toUpperCase()

  async function commit() {
    if (name === undefined || name.trim() === (profile?.name ?? '')) return
    await save(db.profile, { id: 'me', name: name.trim() })
    toast('Profile saved')
  }

  const photoInput = useRef<HTMLInputElement>(null)

  async function pickPhoto(file?: File) {
    if (!file) return
    try {
      const photo = await squarePhoto(file)
      await save(db.profile, { id: 'me', name: profile?.name ?? '', photo })
      toast('Photo updated')
    } catch {
      toast('That photo couldn’t be opened')
    }
    if (photoInput.current) photoInput.current.value = ''
  }

  return (
    <Section footer="Used for greetings and on reports you share with your clinician.">
      <div className="card flex items-center gap-4 p-4">
        <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} aria-label="Profile photo" />
        <button type="button" onClick={() => photoInput.current?.click()} className="relative shrink-0 rounded-full active:opacity-70" aria-label={profile?.photo ? 'Change photo' : 'Add photo'}>
          <Avatar photo={profile?.photo} initial={initial} size={60} />
          <span className="absolute -right-0.5 -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-accent text-accent-ink"><Camera size={12} strokeWidth={2.6} /></span>
        </button>
        <label className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] text-muted">Your name</span>
          <input className="w-full bg-transparent text-[1.25rem] font-semibold outline-none placeholder:text-faint" value={value} onChange={(e) => setName(e.target.value)} onBlur={commit} placeholder="Add your name" autoComplete="given-name" />
        </label>
      </div>
      {profile?.photo && (
        <button type="button" className="mt-2 px-1 text-[0.9375rem] text-danger" onClick={() => save(db.profile, { id: 'me', name: profile.name, photo: undefined }).then(() => toast('Photo removed'))}>
          Remove Photo
        </button>
      )}
    </Section>
  )
}

function AppearanceSection() {
  const [theme, set] = useState<Theme>(getTheme)
  return (
    <Section title="Appearance" footer={theme === 'system' ? 'Follows your iPhone’s Light or Dark setting.' : undefined}>
      <Segmented
        options={[{ value: 'system' as const, label: 'System' }, { value: 'light' as const, label: 'Light' }, { value: 'dark' as const, label: 'Dark' }]}
        value={theme}
        onChange={(t) => {
          setTheme(t)
          set(t)
        }}
      />
    </Section>
  )
}

function DriveSection() {
  const link = useMeta<DriveLink>('drive')
  const lastSyncAt = useMeta<number>('lastSyncAt')
  const sync = useSyncStatus()

  // Preload Google's library so "Sync Now" can open the sign-in popup straight from the tap.
  useEffect(() => {
    if (link && GOOGLE_CLIENT_ID) prepareGoogle().catch(() => {})
  }, [link])

  function syncTapped() {
    const token = cachedToken()
    const run = (t: string) => syncNow(t, true).then(() => toast('Synced with Google Drive')).catch(() => {})
    if (token) void run(token)
    else requestToken(link?.email).then(run, (e: Error) => toast(e.message))
  }

  const [signingOut, setSigningOut] = useState<'confirm' | 'working'>()

  /** Called from the tap, so Google's popup (if a new sign-in is needed) isn't blocked. */
  function signOutTapped() {
    const run = async (t: string) => {
      setSigningOut('working')
      try {
        await signOut(t)
        location.replace('/')
      } catch (e) {
        setSigningOut(undefined)
        toast(`Couldn’t back up, so nothing was removed. ${(e as Error).message}`)
      }
    }
    const token = cachedToken()
    if (token) void run(token)
    else requestToken(link?.email).then(run, (e: Error) => toast(e.message))
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <Section title="Google Drive" footer="Needs a Google client ID for this app (one-time developer setup — see docs/GOOGLE_SETUP.md).">
        <Group inset={TILE_INSET}>
          <Row icon={<IconTile icon={Cloud} color="gray" />} title="Google Drive Backup" value="Not set up" />
        </Group>
      </Section>
    )
  }

  if (link === undefined) {
    return (
      <Section title="Google Drive" footer="Encrypted backups of your data and documents, synced between your devices.">
        <Group inset={TILE_INSET}>
          <Row icon={<IconTile icon={Cloud} color="blue" />} title="Connect Google Drive" tone="accent" to="/settings/drive" />
        </Group>
      </Section>
    )
  }

  const syncing = sync.state === 'syncing'
  return (
    <Section
      title="Google Drive"
      footer={
        sync.state === 'error' ? (
          <span className="text-danger">{sync.error}</span>
        ) : (
          'Encrypted on this iPhone with your passphrase before upload. Syncs in the background while you’re signed in.'
        )
      }
    >
      <Group inset={TILE_INSET}>
        <Row
          icon={<IconTile icon={Cloud} color="blue" />}
          title="Google Drive"
          subtitle={link.email}
          value={syncing ? sync.step : lastSyncAt ? `Synced ${relativeAge(lastSyncAt)}` : 'Not synced yet'}
        />
        <Row icon={<IconTile icon={RefreshCw} color="green" />} title={syncing ? 'Syncing…' : sync.needsSignIn ? 'Sign In and Sync' : 'Sync Now'} tone="accent" onClick={syncing ? undefined : syncTapped} />
        <Row icon={<IconTile icon={LogOut} color="gray" />} title="Sign Out" tone="danger" onClick={signingOut ? undefined : () => setSigningOut('confirm')} />
      </Group>
      {lastSyncAt && <p className="section-footer">Last synced {formatWhen(lastSyncAt)}.</p>}
      {signingOut && (
        <div className="card mt-3 p-4" role="alertdialog" aria-label="Sign out">
          <p className="font-semibold">Sign out of Reclaim on this iPhone?</p>
          <p className="mt-1 text-[0.9375rem] text-muted">
            Everything is backed up to Google Drive first, then removed from this iPhone. To get it all back, open Reclaim, tap Restore from Google Drive and enter your passphrase.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-quiet" onClick={() => setSigningOut(undefined)} disabled={signingOut === 'working'}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={signOutTapped} disabled={signingOut === 'working'}>{signingOut === 'working' ? 'Backing Up…' : 'Back Up and Sign Out'}</button>
          </div>
        </div>
      )}
    </Section>
  )
}

function AiSection() {
  const consent = useMeta<AiConsent>('aiConsent')
  const [health, setHealth] = useState<AiHealth>()
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    aiHealth().then(setHealth)
  }, [])

  async function clearHistory() {
    await Promise.all(['weeklySummary', 'aiAnswers', 'noteSuggestions'].map((k) => db.meta.delete(k)))
    toast('AI history cleared')
  }

  return (
    <Section
      title="AI"
      footer={
        health && !health.configured
          ? 'The AI server isn’t set up yet (GEMINI_API_KEY and AI_ALLOWED_EMAILS — see docs/AI_SETUP.md).'
          : 'AI only runs when you tap an AI button. Each feature sends just what it needs — never your name — and you review suggestions before anything is saved.'
      }
    >
      <Group inset={TILE_INSET}>
        <Toggle icon={<IconTile icon={Sparkles} color="indigo" />} label="AI Features" checked={!!consent} onChange={(on) => (on ? setAsking(true) : void setAiConsent(false))} />
        <Row icon={<IconTile icon={Server} color="gray" />} title="AI Server" value={health === undefined ? 'Checking…' : health.configured ? `Ready${health.model ? ` · ${health.model}` : ''}` : 'Not set up'} />
        <Row icon={<IconTile icon={Trash2} color="gray" />} title="Clear AI History" tone="danger" onClick={clearHistory} />
      </Group>
      {asking && (
        <AiConsentSheet
          onClose={() => setAsking(false)}
          onAccept={() => {
            void setAiConsent(true)
            setAsking(false)
            toast('AI turned on')
          }}
        />
      )}
    </Section>
  )
}

function BackupSection() {
  const lastBackupAt = useMeta<number>('lastBackupAt')
  const counts = useLiveQuery(async () => {
    const [s, m, j, i] = await Promise.all([db.symptoms, db.measurements, db.journal, db.injuries].map(async (t) => (await t.toArray()).filter(alive).length))
    return { entries: s + m + j, injuries: i }
  }, [])
  const [file, setFile] = useState<File>()
  const canShare = file && isTouch() && navigator.canShare?.({ files: [file] })

  async function share() {
    try {
      await navigator.share({ files: [file!], title: file!.name })
      await markBackedUp()
      toast('Backup saved')
      setFile(undefined)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast("Couldn't open the share sheet — try Download")
    }
  }

  async function download() {
    const url = URL.createObjectURL(file!)
    const a = Object.assign(document.createElement('a'), { href: url, download: file!.name })
    document.body.append(a) // Safari only downloads from links in the document
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    await markBackedUp()
    toast('Backup downloaded')
    setFile(undefined)
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <Section title="Backup" footer="One JSON file with everything. Keep it somewhere private — it contains your health data.">
      <div id="backup" />
      <Group inset={TILE_INSET}>
        <Row
          icon={<IconTile icon={HardDrive} color="blue" />}
          title="On This iPhone"
          subtitle={counts ? `${plural(counts.injuries, 'injury', 'injuries')} · ${plural(counts.entries, 'entry', 'entries')}` : undefined}
          value={lastBackupAt ? relativeAge(lastBackupAt) : 'Never backed up'}
        />
        {!file ? (
          <Row icon={<IconTile icon={Download} color="green" />} title="Create Backup" tone="accent" onClick={async () => setFile(await buildBackupFile())} />
        ) : (
          <>
            {canShare && <Row icon={<IconTile icon={Share} color="green" />} title="Save to Files or Google Drive" subtitle={`${file.name} · ${formatBytes(file.size)}`} tone="accent" onClick={share} />}
            <Row icon={<IconTile icon={Download} color="gray" />} title="Download" subtitle={canShare ? undefined : `${file.name} · ${formatBytes(file.size)}`} tone="accent" onClick={download} />
          </>
        )}
      </Group>
      {lastBackupAt && <p className="section-footer">Last backup {formatWhen(lastBackupAt)}.</p>}
    </Section>
  )
}

function RestoreSection() {
  const input = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<ImportPlan>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function pick(f?: File) {
    setError(undefined)
    setPlan(undefined)
    if (!f) return
    try {
      setPlan(await planImport(await f.text()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function confirm() {
    setBusy(true)
    try {
      await applyImport(plan!)
      notifyLocalChange() // a restored backup reaches Drive like any edit
      toast('Backup restored')
      setPlan(undefined)
    } catch (e) {
      setError(`Restore failed, nothing was changed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const totals = plan && DATA_TABLES.reduce((a, t) => ({ add: a.add + plan.counts[t].add, update: a.update + plan.counts[t].update }), { add: 0, update: 0 })
  const changes = totals ? totals.add + totals.update : 0

  return (
    <Section title="Restore" footer="Merges a backup into this iPhone. New entries are added; an entry is only replaced if the backup has a more recent edit.">
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Backup file" />
      {!plan ? (
        <Group inset={TILE_INSET}>
          <Row icon={<IconTile icon={FileUp} color="indigo" />} title="Choose Backup File…" tone="accent" onClick={() => input.current?.click()} />
        </Group>
      ) : (
        <Group>
          <div className="cell !block">
            <p className="text-[0.8125rem] text-muted">Backup from {formatWhen(new Date(plan.exportedAt).getTime())}</p>
            <table className="mt-2 w-full text-[0.9375rem] tabular-nums">
              <thead className="text-left text-[0.8125rem] text-muted">
                <tr>
                  <th className="py-1 font-medium"></th>
                  <th className="py-1 text-right font-medium">New</th>
                  <th className="py-1 text-right font-medium">Update</th>
                  <th className="py-1 text-right font-medium">Same</th>
                </tr>
              </thead>
              <tbody>
                {DATA_TABLES.map((t) => (
                  <tr key={t}>
                    <td className="py-1">{TABLE_LABELS[t]}</td>
                    <td className="py-1 text-right">{plan.counts[t].add}</td>
                    <td className="py-1 text-right">{plan.counts[t].update}</td>
                    <td className="py-1 text-right text-muted">{plan.counts[t].skip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {changes === 0 && <p className="mt-2 text-[0.875rem] text-muted">This iPhone already has everything in this backup.</p>}
          </div>
          <button className="cell cell-press justify-center font-semibold text-accent disabled:opacity-40" disabled={busy || changes === 0} onClick={confirm}>
            Merge {changes} {changes === 1 ? 'Change' : 'Changes'}
          </button>
          <button className="cell cell-press justify-center text-accent" onClick={() => setPlan(undefined)}>Cancel</button>
        </Group>
      )}
      {error && <p className="section-footer !text-danger">{error}</p>}
    </Section>
  )
}

function StorageSection() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof storageStatus>>>()
  useEffect(() => {
    storageStatus().then(setStatus)
  }, [])

  async function protect() {
    const ok = await requestPersistence()
    setStatus(await storageStatus())
    toast(ok ? 'Storage protected' : isIOS() && !isStandalone() ? 'Add Reclaim to your Home Screen first' : 'The browser declined — keep regular backups')
  }

  return (
    <Section
      title="Storage"
      footer={
        isStandalone()
          ? undefined
          : 'On iPhone: open Reclaim in Safari, tap Share → Add to Home Screen. Safari can clear data for websites you haven’t opened in a while; Home Screen apps are exempt.'
      }
    >
      <Group inset={TILE_INSET}>
        <Row
          icon={<IconTile icon={ShieldCheck} color={status?.persisted ? 'green' : 'gray'} />}
          title="Protected from Clearing"
          value={status ? (status.persisted ? 'On' : 'Off') : undefined}
        />
        <Row icon={<IconTile icon={HardDrive} color="gray" />} title="Used" value={formatBytes(status?.usage)} />
        {!isStandalone() && <Row icon={<IconTile icon={Smartphone} color="gray" />} title="Home Screen App" value="Not installed" />}
        {status && !status.persisted && <Row title="Protect My Data" tone="accent" onClick={protect} />}
      </Group>
    </Section>
  )
}

function AboutSection() {
  return (
    <Section title="About" footer="Reclaim helps you track your recovery and prepare for appointments. It doesn't diagnose, and it isn't a substitute for your doctor or physiotherapist.">
      <Group inset={TILE_INSET}>
        <Row icon={<IconTile icon={Info} color="gray" />} title="Reclaim" subtitle="Get back to your life." value={`v${__APP_VERSION__}`} />
      </Group>
    </Section>
  )
}

/** Dev builds only (`npm run dev`): fill the app with the realistic demo person used by the e2e tests. */
function DemoDataSection() {
  const [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true)
    try {
      const { generateDemoData } = await import('../../../e2e/fixtures/demo-data')
      await applyImport(await planImport(JSON.stringify(generateDemoData())))
      notifyLocalChange()
      toast('Demo data loaded')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Developer" footer="Only in dev builds. Adds ~75 days of realistic sample data (merged, nothing is overwritten). Use Delete Everything below to start fresh.">
      <Group inset={TILE_INSET}>
        <Row icon={<IconTile icon={FileUp} color="orange" />} title={busy ? 'Loading…' : 'Load Demo Data'} tone="accent" onClick={busy ? undefined : load} />
      </Group>
    </Section>
  )
}

function DangerSection() {
  const link = useMeta<DriveLink>('drive')
  const [confirmText, setConfirmText] = useState('')
  const [alsoDrive, setAlsoDrive] = useState(false)
  const [working, setWorking] = useState(false)
  const withDrive = !!GOOGLE_CLIENT_ID && (!!link || alsoDrive)

  /** A true fresh start: this iPhone, and (when chosen, or when connected) the encrypted backups in Drive. */
  function wipe() {
    const run = async (token?: string) => {
      setWorking(true)
      try {
        if (token) await deleteDriveData(token)
        await deleteEverything()
        forgetToken()
        location.replace('/')
      } catch (e) {
        setWorking(false)
        toast(`Nothing was deleted: ${(e as Error).message}`)
      }
    }
    if (!withDrive) return void run()
    const token = cachedToken()
    if (token) void run(token)
    else requestToken(link?.email).then(run, (e: Error) => toast(e.message)) // straight from the tap: the popup isn't blocked
  }

  return (
    <Section
      title="Delete Everything"
      footer={`${withDrive ? 'Permanently deletes everything from this iPhone and your encrypted backups in Google Drive — a fresh start.' : 'Permanently deletes everything from this iPhone.'} This can’t be undone.${link ? ' To keep a copy you can restore, use Sign Out instead.' : ''} Type "DELETE" to confirm.`}
    >
      <Group>
        {GOOGLE_CLIENT_ID && !link && <Toggle label="Also Delete Google Drive Backups" checked={alsoDrive} onChange={setAlsoDrive} />}
        <input className="cell bg-transparent outline-none placeholder:text-faint" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "DELETE"' autoCapitalize="characters" autoComplete="off" aria-label='Type "DELETE" to confirm' />
        <button className="cell cell-press justify-center text-danger disabled:opacity-40" disabled={confirmText !== 'DELETE' || working} onClick={wipe}>
          {working ? 'Deleting…' : 'Delete Everything'}
        </button>
      </Group>
    </Section>
  )
}
