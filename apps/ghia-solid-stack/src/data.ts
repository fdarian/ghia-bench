import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Message } from './types'

const BUNDLED = join(dirname(process.execPath), '../Resources/messages.json')
const FROM_SOURCE = new URL('../../../data/messages.json', import.meta.url).pathname
const STYLESHEET = join(dirname(process.execPath), '../Resources/stylex.css')

export function loadMessages(): Message[] {
  const path = process.execPath.endsWith('/bun') ? FROM_SOURCE : BUNDLED
  return JSON.parse(readFileSync(path, 'utf8')) as Message[]
}

/** The CSS StyleX extracted at build time; build.ts ships it next to messages.json. */
export function loadStylesheet(): string {
  return readFileSync(STYLESHEET, 'utf8')
}
