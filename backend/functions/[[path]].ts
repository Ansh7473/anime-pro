import { handle } from 'hono/cloudflare-pages'
import app from '../src/server.ts'

export const onRequest = handle(app)
