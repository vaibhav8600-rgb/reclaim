/** Vercel Function: GET (daily cron) and POST (subscribe, unsubscribe, test) /api/push. Logic in server/push.ts. */
import { handlePush, pushFromEnv } from '../server/push.ts'

// See api/ai.ts: the only Node API used here.
declare const process: { env: Record<string, string | undefined> }

const deps = pushFromEnv(process.env)

export const GET = (req: Request) => handlePush(req, deps)
export const POST = (req: Request) => handlePush(req, deps)
