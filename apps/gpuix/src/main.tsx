import { render } from '@ghia/solid'
import { App } from './App'
import { loadMessages } from './data'

const messages = loadMessages()

render(() => <App messages={messages} />, {
  title: 'Mailbox',
  width: 1280,
  height: 800,
  x: 100,
  y: 100,
  appearance: 'light',
})
