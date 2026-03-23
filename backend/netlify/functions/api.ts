import { handle } from 'hono/netlify'
import app from '../../src/server.ts'

export const handler = handle(app)
