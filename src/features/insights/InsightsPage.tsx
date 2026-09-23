import { useState } from 'react'
import { FileText } from 'lucide-react'
import type { AiOutput } from '../../../shared/ai'
import { useMeta } from '../../db/hooks'
import { setMeta } from '../../db/repo'
import { AI_DISCLAIMER, AiAction, InsightCard } from '../../components/ai'
import { Group, IconTile, NavBar, Row, Section } from '../../components/ui'
import { runAi } from '../../lib/ai'
import { buildAiContext } from '../../lib/aiContext'
import { formatWhen, relativeAge } from '../../lib/dates'

export interface StoredSummary {
  result: AiOutput<'weekly-summary'>
  at: number
}
export interface StoredAnswer {
  question: string
  result: AiOutput<'ask'>
  at: number
}

const SUGGESTIONS = ['Why was my pain higher this week?', 'Is my rehab helping?', 'What changed since last month?', 'When is my pain worst during the day?']

export function InsightsPage() {
  const summary = useMeta<StoredSummary>('weeklySummary')
  const answers = useMeta<StoredAnswer[]>('aiAnswers') ?? []
  const [question, setQuestion] = useState('')
  /** Answers shown while they stream in, before they're saved. */
  const [writingSummary, setWritingSummary] = useState<Partial<AiOutput<'weekly-summary'>>>()
  const [writingAnswer, setWritingAnswer] = useState<{ question: string; partial: Partial<AiOutput<'ask'>> }>()

  async function generateSummary() {
    try {
      const result = await runAi('weekly-summary', { context: await buildAiContext({ days: 14 }) }, setWritingSummary)
      await setMeta('weeklySummary', { result, at: Date.now() } satisfies StoredSummary)
    } finally {
      setWritingSummary(undefined)
    }
  }

  async function ask() {
    const q = question.trim()
    try {
      const result = await runAi('ask', { question: q, context: await buildAiContext({ days: 30 }) }, (partial) => setWritingAnswer({ question: q, partial }))
      await setMeta('aiAnswers', [{ question: q, result, at: Date.now() }, ...answers].slice(0, 10) satisfies StoredAnswer[])
      setQuestion('')
    } finally {
      setWritingAnswer(undefined)
    }
  }

  const [latest, ...older] = answers

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Insights" back="/" />

      <Section prominent title="This Week">
        {writingSummary ? (
          <InsightCard insight={writingSummary} lead={writingSummary.headline ?? '…'} streaming />
        ) : summary ? (
          <InsightCard insight={summary.result} lead={summary.result.headline} footer={`${AI_DISCLAIMER} Generated ${formatWhen(summary.at)}.`} />
        ) : (
          <p className="px-1 pb-1 text-muted">A calm summary of your last 7 days compared with the week before — pain, rehab, measurements and notes.</p>
        )}
        <div className="mt-3">
          <AiAction label={summary ? 'Update Summary' : 'Create Weekly Summary'} runningLabel="Reading your week…" run={generateSummary} />
        </div>
      </Section>

      <Section prominent title="Ask About Your Recovery">
        <textarea
          className="input min-h-20"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why was my pain higher this week?"
          maxLength={500}
          aria-label="Your question"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip !min-h-8 !text-[0.875rem]" onClick={() => setQuestion(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <AiAction label="Ask" runningLabel="Looking through your log…" run={ask} disabled={question.trim().length < 2} className="btn btn-primary w-full" />
        </div>
        {writingAnswer && (
          <div className="mt-4">
            <p className="mb-2 px-1 text-[0.9375rem] font-semibold">“{writingAnswer.question}”</p>
            <InsightCard insight={writingAnswer.partial} lead={writingAnswer.partial.answer ?? '…'} streaming />
          </div>
        )}
        {latest && !writingAnswer && (
          <div className="mt-4">
            <p className="mb-2 px-1 text-[0.9375rem] font-semibold">“{latest.question}”</p>
            <InsightCard insight={latest.result} lead={latest.result.answer} footer={`${AI_DISCLAIMER} ${formatWhen(latest.at)}.`} />
          </div>
        )}
        {older.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer px-1 text-[0.9375rem] text-accent">Earlier questions ({older.length})</summary>
            <div className="mt-3 space-y-4">
              {older.map((a) => (
                <div key={a.at}>
                  <p className="mb-2 px-1 text-[0.9375rem] font-semibold">“{a.question}” <span className="font-normal text-muted">· {relativeAge(a.at)}</span></p>
                  <InsightCard insight={a.result} lead={a.result.answer} />
                </div>
              ))}
            </div>
          </details>
        )}
      </Section>

      <Section title="For Your Appointment">
        <Group inset="3.625rem">
          <Row icon={<IconTile icon={FileText} color="blue" />} title="Clinician Report" subtitle="A printable summary of the last 30 days" to="/report" />
        </Group>
      </Section>
    </div>
  )
}
