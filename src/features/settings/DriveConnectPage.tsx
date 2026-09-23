import { useEffect, useState, type FormEvent } from 'react'
import { Cloud, KeyRound, Lock, RefreshCw } from 'lucide-react'
import { Field, Group, IconTile, SheetHeader } from '../../components/ui'
import { WrongPassphraseError } from '../../lib/crypto'
import type { DriveFile } from '../../lib/drive'
import { prepareGoogle, requestToken } from '../../lib/google'
import { useBack } from '../../lib/nav'
import { connectDrive, listSnapshots } from '../../lib/sync'
import { toast } from '../../lib/toast'

type Step = { name: 'intro' } | { name: 'passphrase'; token: string; existing: DriveFile[] } | { name: 'working'; label: string }

const MIN_LENGTH = 8

/** Two steps: sign in with Google, then unlock (existing backups) or create the encryption passphrase. */
export function DriveConnectPage() {
  const back = useBack('/settings', 'sheet-down')
  const [step, setStep] = useState<Step>({ name: 'intro' })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)

  // Load Google's library now, so tapping Continue can open the sign-in popup straight away.
  useEffect(() => {
    prepareGoogle().then(() => setReady(true), (e: Error) => setError(e.message))
  }, [])

  function signIn() {
    setError(undefined)
    requestToken() // must run synchronously inside the tap
      .then(async (token) => {
        setStep({ name: 'working', label: 'Looking for your backups…' })
        setStep({ name: 'passphrase', token, existing: await listSnapshots(token) })
      })
      .catch((e: Error) => {
        setStep({ name: 'intro' })
        setError(e.message)
      })
  }

  const creating = step.name === 'passphrase' && step.existing.length === 0
  const canSubmit = step.name === 'passphrase' && (creating ? pass.length >= MIN_LENGTH && pass === confirm && understood : pass.length > 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (step.name !== 'passphrase' || !canSubmit) return
    const { token, existing } = step
    setError(undefined)
    setStep({ name: 'working', label: existing.length ? 'Unlocking and syncing…' : 'Encrypting your first backup…' })
    try {
      await connectDrive(token, pass, existing)
      toast('Google Drive connected')
      back()
    } catch (err) {
      setStep({ name: 'passphrase', token, existing })
      setError(err instanceof WrongPassphraseError ? 'That passphrase doesn’t unlock your backups. Try again.' : (err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto min-h-dvh max-w-xl bg-bg pb-12">
      <SheetHeader title="Google Drive" canSave={canSubmit} onClose={back} />
      <div className="space-y-6 px-4 pt-4">
        {step.name === 'intro' && (
          <>
            <div className="flex flex-col items-center px-4 pt-4 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[1.1rem] bg-tile-blue text-white">
                <Cloud size={34} strokeWidth={2} />
              </span>
              <h2 className="text-[1.5rem] font-bold">Back up to Google Drive</h2>
              <p className="mt-1 text-muted">Keep your recovery data and documents safe, and in sync between your devices.</p>
            </div>
            <Group inset="3.625rem">
              <Point icon={Lock} color="green" title="Encrypted on this iPhone" body="With a passphrase only you know. Google can't read it." />
              <Point icon={KeyRound} color="indigo" title="A private app folder" body="Separate from your files. Reclaim can't see anything else in your Drive." />
              <Point icon={RefreshCw} color="blue" title="Syncs automatically" body="While you're signed in, changes back up in the background." />
            </Group>
            <button type="button" className="btn btn-primary w-full" onClick={signIn} disabled={!ready}>
              {ready ? 'Continue with Google' : 'Loading…'}
            </button>
          </>
        )}

        {step.name === 'working' && <p className="py-16 text-center text-muted">{step.label}</p>}

        {step.name === 'passphrase' && (
          <>
            <div className="px-1">
              <h2 className="text-[1.375rem] font-bold">{creating ? 'Create a passphrase' : 'Enter your passphrase'}</h2>
              <p className="mt-1 text-muted">
                {creating
                  ? 'It encrypts everything before it leaves this iPhone. You’ll need it to restore on a new device.'
                  : `Your Drive has ${step.existing.length === 1 ? 'a backup' : 'backups'} from Reclaim. Enter the passphrase you chose to unlock ${step.existing.length === 1 ? 'it' : 'them'}.`}
              </p>
            </div>
            <Field label="Passphrase" hint={creating ? 'At least 8 characters. A few random words is easy to remember and hard to guess.' : undefined}>
              <input className="input" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" />
            </Field>
            {creating && (
              <>
                <Field label="Confirm Passphrase">
                  <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm passphrase" />
                </Field>
                {confirm && pass !== confirm && <p className="section-footer -mt-4 !text-danger">Passphrases don’t match.</p>}
                <label className="card flex cursor-pointer items-start gap-3 p-4">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-accent)]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  <span className="text-[0.9375rem]">
                    I understand that if I forget this passphrase, my Drive backups <strong>can’t be recovered</strong> — not by Reclaim, not by Google.
                  </span>
                </label>
              </>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit}>
              {creating ? 'Encrypt and Back Up' : 'Unlock'}
            </button>
          </>
        )}

        {error && <p className="rounded-2xl bg-fill p-4 text-[0.9375rem] text-danger">{error}</p>}
      </div>
    </form>
  )
}

function Point({ icon, color, title, body }: { icon: typeof Lock; color: string; title: string; body: string }) {
  return (
    <div className="cell !items-start">
      <IconTile icon={icon} color={color} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-[0.875rem] text-muted">{body}</span>
      </span>
    </div>
  )
}
