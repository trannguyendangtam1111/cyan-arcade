import { vercelConfiguration } from './deployment.ts'

// Evaluated by Vercel, independently of the ordinary local Vite build.
export const config = vercelConfiguration(process.env)
