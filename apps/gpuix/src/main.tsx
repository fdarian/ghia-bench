import { render } from '@gpuix/solid'
import { App } from './App'
import { loadMessages } from './data'
import { placeWindow } from './window'

const messages = loadMessages()

render(() => <App messages={messages} />, {
  title: 'Mailbox',
  width: 1280,
  height: 800,
})
placeWindow(100, 100)
