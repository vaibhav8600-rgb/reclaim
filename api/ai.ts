/** Vercel Function: POST/GET /api/ai. All logic lives in server/ai/handler.ts (also used by the Vite dev server). */
import { depsFromEnv, handleAi } from '../server/ai/handler'

const deps = depsFromEnv(process.env)

export const GET = (req: Request) => handleAi(req, deps)
export const POST = (req: Request) => handleAi(req, deps)
