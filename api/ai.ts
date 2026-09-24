/** Vercel Function: POST/GET /api/ai. All logic lives in server/ai/handler.ts (also used by the Vite dev server). */
import { depsFromEnv, handleAi } from '../server/ai/handler'

// The only Node API used here. Declared rather than loaded from @types/node: Vercel's TypeScript 7 check can't
// resolve type packages, so api/tsconfig.json asks for none.
declare const process: { env: Record<string, string | undefined> }

const deps = depsFromEnv(process.env)

export const GET = (req: Request) => handleAi(req, deps)
export const POST = (req: Request) => handleAi(req, deps)
