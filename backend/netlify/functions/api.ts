import { handle } from 'hono/netlify'
import app from '../../src/server.ts'

console.log("Netlify function 'api' initialized");
export const handler = handle(app)
