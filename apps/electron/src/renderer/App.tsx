import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
import type { Message } from './types'

const ROW_HEIGHT = 72

const FOLDERS: { name: string; count: string }[] = [
  { name: 'Inbox', count: '' },
  { name: 'Starred', count: '24' },
  { name: 'Sent', count: '128' },
  { name: 'Drafts', count: '3' },
  { name: 'Archive', count: '2,048' },
  { name: 'Spam', count: '12' },
  { name: 'Trash', count: '' },
]

const LABELS: { name: string; color: string }[] = [
  { name: 'Work', color: '#2563EB' },
  { name: 'Personal', color: '#16A34A' },
  { name: 'Finance', color: '#CA8A04' },
  { name: 'Travel', color: '#9333EA' },
  { name: 'Family', color: '#DB2777' },
  { name: 'Receipts', color: '#EA580C' },
  { name: 'Newsletters', color: '#0891B2' },
  { name: 'Projects', color: '#4F46E5' },
]

const numberFormat = new Intl.NumberFormat('en-US')

function avatarClass(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return `avatar avatar-${hash % 8}`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
}

function Sidebar(props: { unreadCount: number }) {
  return (
    <aside class="sidebar">
      <div class="sidebar-title">Mailbox</div>
      <For each={FOLDERS}>
        {(folder) => (
          <div class="folder" classList={{ 'folder-selected': folder.name === 'Inbox' }}>
            <span class="folder-name">{folder.name}</span>
            <span class="folder-count">
              {folder.name === 'Inbox' ? (props.unreadCount ? numberFormat.format(props.unreadCount) : '') : folder.count}
            </span>
          </div>
        )}
      </For>
      <div class="labels-heading">LABELS</div>
      <For each={LABELS}>
        {(label) => (
          <div class="label">
            <span class="label-dot" style={{ background: label.color }} />
            <span class="label-name">{label.name}</span>
          </div>
        )}
      </For>
    </aside>
  )
}

function Row(props: { message: Message; selected: boolean; top: number; onSelect: () => void }) {
  return (
    <div
      class="row"
      classList={{ 'row-selected': props.selected, 'row-unread': props.message.unread }}
      style={{ transform: `translateY(${props.top}px)` }}
      onClick={props.onSelect}
    >
      <Show when={props.message.unread}>
        <span class="unread-dot" />
      </Show>
      <div class={avatarClass(props.message.fromName)}>{initials(props.message.fromName)}</div>
      <div class="row-text">
        <div class="row-line1">
          <span class="row-from">{props.message.fromName}</span>
          <span class="row-time">{props.message.time}</span>
        </div>
        <div class="row-subject">{props.message.subject}</div>
        <div class="row-snippet">{props.message.snippet}</div>
      </div>
    </div>
  )
}

function Detail(props: { message: Message | undefined; ref: (el: HTMLElement) => void }) {
  return (
    <main class="detail" ref={props.ref}>
      <Show when={props.message} fallback={<div class="detail-empty">No message selected</div>} keyed>
        {(message) => (
          <article>
            <h1 class="detail-subject">{message.subject}</h1>
            <div class="detail-sender">
              <div class={`${avatarClass(message.fromName)} avatar-large`}>{initials(message.fromName)}</div>
              <div class="detail-sender-text">
                <div class="detail-from">{message.fromName}</div>
                <div class="detail-email">{message.fromEmail}</div>
              </div>
              <div class="detail-date">{message.dateLong}</div>
            </div>
            <div class="detail-body">
              <For each={message.body}>{(paragraph) => <p>{paragraph}</p>}</For>
            </div>
          </article>
        )}
      </Show>
    </main>
  )
}

export function App() {
  const [messages, setMessages] = createSignal<Message[]>([])
  const [haystacks, setHaystacks] = createSignal<string[]>([])
  const [query, setQuery] = createSignal('')
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  let listEl!: HTMLDivElement
  let detailEl!: HTMLElement
  let inputEl!: HTMLInputElement

  const results = createMemo(() => {
    const q = query()
    const all = messages()
    if (q === '') return all
    const hay = haystacks()
    return all.filter((_, i) => hay[i].includes(q))
  })

  const unreadCount = createMemo(() => messages().filter((m) => m.unread).length)
  const selected = () => results()[selectedIndex()]

  const virtualizer = createVirtualizer({
    get count() {
      return results().length
    },
    getScrollElement: () => listEl,
    estimateSize: () => ROW_HEIGHT,
  })

  function select(index: number) {
    setSelectedIndex(index)
    detailEl.scrollTop = 0
  }

  function setFilter(value: string) {
    setQuery(value.trim().toLowerCase())
    setSelectedIndex(0)
    virtualizer.scrollToOffset(0)
    detailEl.scrollTop = 0
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const count = results().length
      if (count === 0) return
      const next = Math.min(count - 1, Math.max(0, selectedIndex() + (event.key === 'ArrowDown' ? 1 : -1)))
      select(next)
      virtualizer.scrollToIndex(next, { align: 'auto' })
    } else if (event.key === 'Escape') {
      inputEl.value = ''
      setFilter('')
    }
  }

  onMount(async () => {
    inputEl.focus()
    const response = await fetch('./messages.json')
    const loaded = (await response.json()) as Message[]
    setHaystacks(loaded.map((m) => `${m.fromName} ${m.subject} ${m.snippet}`.toLowerCase()))
    setMessages(loaded)
  })

  return (
    <div class="app">
      <Sidebar unreadCount={unreadCount()} />
      <section class="list-column">
        <div class="search">
          <input
            ref={inputEl}
            class="search-input"
            type="text"
            placeholder="Search mail"
            spellcheck={false}
            onInput={(event) => setFilter(event.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div class="count">{numberFormat.format(results().length)} conversations</div>
        <div class="list" ref={listEl}>
          <div class="list-inner" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            <For each={virtualizer.getVirtualItems()}>
              {(item) => (
                <Show when={results()[item.index]}>
                  {(message) => (
                    <Row
                      message={message()}
                      selected={item.index === selectedIndex()}
                      top={item.start}
                      onSelect={() => select(item.index)}
                    />
                  )}
                </Show>
              )}
            </For>
          </div>
        </div>
      </section>
      <Detail message={selected()} ref={(el) => (detailEl = el)} />
    </div>
  )
}
