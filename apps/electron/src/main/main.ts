import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const win = new BrowserWindow({
    x: 100,
    y: 100,
    width: 1280,
    height: 800,
    useContentSize: true,
    title: 'Mailbox',
    backgroundColor: '#FFFFFF',
    show: false,
  })
  win.once('ready-to-show', () => {
    win.show()
    app.focus({ steal: true })
  })
  void win.loadFile(path.join(dirname, '../renderer/index.html'))
}

void app.whenReady().then(createWindow)

app.on('window-all-closed', () => app.quit())
