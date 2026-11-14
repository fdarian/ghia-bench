import { render } from '@ghia/solid'
import { App } from './App'
import { loadMessages, loadStylesheet } from './data'

const messages = loadMessages()
const stylesheet = loadStylesheet()

render(
  () => (
    <>
      <style>{stylesheet}</style>
      <App messages={messages} />
    </>
  ),
  {
    title: 'Mailbox',
    width: 1280,
    height: 800,
    x: 100,
    y: 100,
    appearance: 'light',
  },
)
