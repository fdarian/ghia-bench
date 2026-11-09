import { CFunction, dlopen, ptr, type Pointer } from 'bun:ffi'

/**
 * @gpuix/solid 0.11.0's render() takes no window position or appearance, so the app does both
 * through the Objective-C runtime: Aqua for NSApp, and the window's frame top-left at screen
 * (100, 100). It relies on gpuix pumping AppKit from the JS thread (`renderer.tick()`).
 */

const POLL_INTERVAL_MS = 5
const POLL_TIMEOUT_MS = 5000

const objc = dlopen('/usr/lib/libobjc.A.dylib', {
  objc_getClass: { args: ['cstring'], returns: 'ptr' },
  sel_registerName: { args: ['cstring'], returns: 'ptr' },
})
const coreGraphics = dlopen('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics', {
  CGMainDisplayID: { args: [], returns: 'u32' },
  CGDisplayPixelsHigh: { args: ['u32'], returns: 'u64' },
})
// bun:ffi sets `ptr` on each symbol but its types omit it.
const msgSendAddress = (
  dlopen('/usr/lib/libobjc.A.dylib', { objc_msgSend: { args: [], returns: 'void' } }).symbols.objc_msgSend as unknown as {
    ptr: Pointer
  }
).ptr

function msgSend<Args extends ('ptr' | 'u64' | 'f64' | 'cstring')[], Returns extends 'ptr' | 'u64' | 'bool' | 'void'>(
  args: Args,
  returns: Returns,
) {
  return CFunction({ ptr: msgSendAddress, args: ['ptr', 'ptr', ...args], returns })
}

const sendForPointer = msgSend([], 'ptr')
const sendWithPointer = msgSend(['ptr'], 'ptr')
const sendWithString = msgSend(['ptr'], 'ptr')
const sendWithIndex = msgSend(['u64'], 'ptr')
const sendForCount = msgSend([], 'u64')
const sendForBool = msgSend([], 'bool')
const sendWithPoint = msgSend(['f64', 'f64'], 'void')

const classOf = (name: string) => objc.symbols.objc_getClass(Buffer.from(`${name}\0`))
const selector = (name: string) => objc.symbols.sel_registerName(Buffer.from(`${name}\0`))

const sel = {
  sharedApplication: selector('sharedApplication'),
  windows: selector('windows'),
  count: selector('count'),
  objectAtIndex: selector('objectAtIndex:'),
  isMainThread: selector('isMainThread'),
  stringWithUTF8String: selector('stringWithUTF8String:'),
  appearanceNamed: selector('appearanceNamed:'),
  setAppearance: selector('setAppearance:'),
  setFrameTopLeftPoint: selector('setFrameTopLeftPoint:'),
}

function nonNull<Value>(value: Value | null, what: string): Value {
  if (!value) throw new Error(`${what} returned null`)
  return value
}

function setAquaAppearance(app: Pointer) {
  const nameBytes = Buffer.from('NSAppearanceNameAqua\0')
  const name = nonNull(sendWithString(classOf('NSString'), sel.stringWithUTF8String, ptr(nameBytes)), 'NSString')
  const aqua = nonNull(sendWithPointer(classOf('NSAppearance'), sel.appearanceNamed, name), 'NSAppearance aqua')
  sendWithPointer(app, sel.setAppearance, aqua)
}

function firstWindow(app: Pointer): Pointer | null {
  const windows = nonNull(sendForPointer(app, sel.windows), 'NSApp windows')
  if (sendForCount(windows, sel.count) === 0n) return null
  return nonNull(sendWithIndex(windows, sel.objectAtIndex, 0n), 'NSApp windows[0]')
}

/** Call right after render(): the window exists once init() returns, else it is polled for. */
export function placeWindow(left: number, top: number) {
  if (!sendForBool(classOf('NSThread'), sel.isMainThread)) throw new Error('JS is not on the AppKit main thread')
  const app = nonNull(sendForPointer(classOf('NSApplication'), sel.sharedApplication), 'NSApplication')
  setAquaAppearance(app)
  const screenHeight = Number(coreGraphics.symbols.CGDisplayPixelsHigh(coreGraphics.symbols.CGMainDisplayID()))

  function place(window: Pointer) {
    sendWithPoint(window, sel.setFrameTopLeftPoint, left, screenHeight - top)
  }

  const immediate = firstWindow(app)
  if (immediate) return place(immediate)

  const started = performance.now()
  const timer = setInterval(() => {
    const window = firstWindow(app)
    if (window) {
      clearInterval(timer)
      place(window)
    } else if (performance.now() - started > POLL_TIMEOUT_MS) {
      clearInterval(timer)
      throw new Error('no NSWindow appeared')
    }
  }, POLL_INTERVAL_MS)
}
