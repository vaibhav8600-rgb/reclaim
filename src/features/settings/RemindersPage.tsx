import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Group, IconTile, NavBar, Section, Toggle } from '../../components/ui'
import { cachedToken, GOOGLE_CLIENT_ID, prepareGoogle, requestToken } from '../../lib/google'
import { isIOS, isStandalone } from '../../lib/platform'
import { currentSubscription, pushSupported, sendTestReminder, turnOffReminders, turnOnReminders, VAPID_PUBLIC_KEY } from '../../lib/push'
import { toast } from '../../lib/toast'

/** A daily evening reminder: what's left to do today, worked out on the phone. */
export function RemindersPage() {
  const [sub, setSub] = useState<PushSubscription | null>()
  const [busy, setBusy] = useState(false)
  const [signIn, setSignIn] = useState(false)
  const supported = pushSupported()

  useEffect(() => {
    if (!supported) return
    currentSubscription().then(setSub, () => setSub(null))
    if (GOOGLE_CLIENT_ID) prepareGoogle().catch(() => undefined)
  }, [supported])

  const blocker = !VAPID_PUBLIC_KEY || !GOOGLE_CLIENT_ID
    ? 'Reminders aren’t set up on this server yet (docs/PUSH_SETUP.md).'
    : isIOS() && !isStandalone()
      ? 'Add Reclaim to your Home Screen first — iPhone only sends notifications to Home Screen apps. Tap Share, then “Add to Home Screen”, and open it from there.'
      : !supported
        ? 'This browser can’t receive reminders.'
        : undefined

  async function run(task: (token: string) => Promise<void>) {
    const token = cachedToken()
    if (!token) return setSignIn(true)
    setBusy(true)
    try {
      await task(token)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (on: boolean) =>
    on
      ? run(async (token) => {
          setSub(await turnOnReminders(token))
          toast('Daily reminder on')
        })
      : sub &&
        (async () => {
          setBusy(true)
          await turnOffReminders(cachedToken(), sub).catch(() => undefined)
          setSub(null)
          setBusy(false)
          toast('Daily reminder off')
        })()

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Reminders" subtitle="A daily nudge in the evening" back="/settings" />
      {blocker ? (
        <Section>
          <p className="card flex items-start gap-3 p-4 text-[0.9375rem]" data-testid="reminders-blocked">
            <IconTile icon={Bell} color="orange" />
            <span className="min-w-0 flex-1">{blocker}</span>
          </p>
        </Section>
      ) : (
        <>
          <Section footer="Once a day, between about 7:30 and 8:30 pm India time: what’s left for today — rehab, the morning check, the weekly check-in or steps. It’s worked out on your iPhone; no health data is sent to the server.">
            <Group>
              <Toggle label="Daily Reminder" icon={<IconTile icon={Bell} color="orange" />} checked={!!sub} onChange={(v) => !busy && sub !== undefined && toggle(v)} />
            </Group>
          </Section>
          {signIn && !cachedToken() && (
            <Section footer="Reminders use the same Google sign-in as AI, so only you can turn them on.">
              <button type="button" className="btn btn-primary w-full" onClick={() => requestToken().then(() => setSignIn(false), (e: Error) => toast(e.message))}>Sign in with Google</button>
            </Section>
          )}
          {sub && (
            <Section>
              <button type="button" className="btn btn-soft w-full" disabled={busy} onClick={() => run(async (token) => { await sendTestReminder(token, sub); toast('Test reminder sent — it should arrive in a few seconds') })}>Send a Test Reminder</button>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
