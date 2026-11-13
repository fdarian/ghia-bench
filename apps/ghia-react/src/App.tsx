import { useRef, useState } from 'react'
import type { KeyboardEvent, Ref, RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Avatar } from '@base-ui/react/avatar'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { ScrollArea } from '@base-ui/react/scroll-area'
import * as stylex from '@stylexjs/stylex'
import type { StyleXStyles } from '@stylexjs/stylex'
import type { Message } from './types'

const ROW_HEIGHT = 72
const OVERSCAN = 10

const FOLDERS = ['Inbox', 'Starred', 'Sent', 'Drafts', 'Archive', 'Spam', 'Trash']
const FOLDER_COUNTS: Record<string, number> = {
  Starred: 24,
  Sent: 128,
  Drafts: 3,
  Archive: 2048,
  Spam: 12,
  Trash: 0,
}

const LABELS = [
  { name: 'Work', style: 'work' },
  { name: 'Personal', style: 'personal' },
  { name: 'Finance', style: 'finance' },
  { name: 'Travel', style: 'travel' },
  { name: 'Family', style: 'family' },
  { name: 'Receipts', style: 'receipts' },
  { name: 'Newsletters', style: 'newsletters' },
  { name: 'Projects', style: 'projects' },
] as const

const numberFormat = new Intl.NumberFormat('en-US')
const formatCount = (count: number) => (count === 0 ? '' : numberFormat.format(count))

const styles = stylex.create({
  app: {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },

  avatar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarSmall: { width: 36, height: 36, borderRadius: 18 },
  avatarLarge: { width: 40, height: 40, borderRadius: 20 },
  avatarInitials: { display: 'block', fontWeight: 600, color: '#FFFFFF' },
  avatarInitialsSmall: { fontSize: 13 },
  avatarInitialsLarge: { fontSize: 15 },

  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: 220,
    height: '100%',
    backgroundColor: '#F4F4F5',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#E4E4E7',
  },
  brand: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: 48,
    marginBottom: 8,
    paddingLeft: 16,
  },
  brandName: { fontSize: 15, fontWeight: 600, color: '#18181B' },
  folder: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    height: 32,
    marginLeft: 8,
    marginRight: 8,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 6,
    backgroundColor: { default: null, ':hover': '#EBEBED' },
  },
  folderSelected: { backgroundColor: { default: '#E4E4E7', ':hover': '#E4E4E7' } },
  folderName: { fontSize: 13, color: '#27272A' },
  folderCount: { fontSize: 12, color: '#71717A' },
  labelsHeading: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    height: 24,
    marginTop: 16,
    paddingLeft: 16,
  },
  labelsHeadingText: { fontSize: 11, fontWeight: 600, color: '#A1A1AA' },
  label: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
    height: 28,
    marginLeft: 8,
    marginRight: 8,
    paddingLeft: 8,
    paddingRight: 8,
  },
  labelDot: { width: 8, height: 8, flexShrink: 0, borderRadius: 4 },
  labelName: { fontSize: 13, color: '#3F3F46' },

  listPane: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: 420,
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#E4E4E7',
  },
  searchBar: { flexShrink: 0, height: 56, padding: 12 },
  search: {
    width: 396,
    height: 32,
    paddingLeft: 10,
    paddingRight: 10,
    fontSize: 13,
    color: '#18181B',
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: { default: '#E4E4E7', ':focus-visible': '#2563EB' },
    borderRadius: 8,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    height: 28,
    paddingLeft: 16,
  },
  summaryText: { fontSize: 12, color: '#71717A' },
  list: { flexGrow: 1, minHeight: 0, overflowY: 'auto' },
  listInner: { position: 'relative', width: '100%' },

  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#F4F4F5',
    userSelect: 'none',
    backgroundColor: { default: null, ':hover': '#F4F4F5' },
  },
  rowSelected: { backgroundColor: { default: '#DBEAFE', ':hover': '#DBEAFE' } },
  unreadDot: {
    position: 'absolute',
    left: 4,
    top: 17,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  rowAvatar: { position: 'absolute', left: 16, top: 12 },
  rowText: {
    position: 'absolute',
    left: 64,
    right: 16,
    top: 12,
    display: 'flex',
    flexDirection: 'column',
  },
  rowHeader: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 18,
  },
  oneLine: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sender: { minWidth: 0, fontSize: 13, fontWeight: 500, color: '#3F3F46' },
  senderUnread: { fontWeight: 600, color: '#18181B' },
  time: { flexShrink: 0, fontSize: 12, color: '#71717A' },
  subject: { height: 18, lineHeight: '18px', fontSize: 13, color: '#27272A' },
  snippet: { height: 16, lineHeight: '16px', fontSize: 12, color: '#71717A' },

  detail: {
    flexGrow: 1,
    minWidth: 0,
    height: '100%',
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  viewport: { width: '100%', height: '100%' },
  detailContent: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: 32,
  },
  scrollbar: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: '100%',
    opacity: { default: 0, ':hover': 1 },
  },
  thumb: { width: 8, borderRadius: 4, backgroundColor: '#D4D4D8' },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  emptyText: { fontSize: 14, color: '#A1A1AA' },
  message: { display: 'flex', flexDirection: 'column', flexShrink: 0 },
  title: { fontSize: 22, lineHeight: '28px', fontWeight: 600, color: '#18181B' },
  byline: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    height: 40,
    marginTop: 16,
  },
  bylineText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  bylineName: { height: 20, lineHeight: '20px', fontSize: 14, fontWeight: 600, color: '#18181B' },
  bylineEmail: { height: 20, lineHeight: '20px', fontSize: 13, color: '#71717A' },
  dateLong: { marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: '#71717A' },
  body: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 },
  paragraph: { fontSize: 14, lineHeight: '22px', color: '#27272A' },
})

// One static style per colour: Ghia's CSS has no custom properties in StyleX's dynamic form.
const avatarColors = stylex.create({
  c0: { backgroundColor: '#F87171' },
  c1: { backgroundColor: '#FB923C' },
  c2: { backgroundColor: '#FBBF24' },
  c3: { backgroundColor: '#34D399' },
  c4: { backgroundColor: '#22D3EE' },
  c5: { backgroundColor: '#60A5FA' },
  c6: { backgroundColor: '#A78BFA' },
  c7: { backgroundColor: '#F472B6' },
})
const AVATAR_COLORS = [
  avatarColors.c0,
  avatarColors.c1,
  avatarColors.c2,
  avatarColors.c3,
  avatarColors.c4,
  avatarColors.c5,
  avatarColors.c6,
  avatarColors.c7,
]

const labelColors = stylex.create({
  work: { backgroundColor: '#2563EB' },
  personal: { backgroundColor: '#16A34A' },
  finance: { backgroundColor: '#CA8A04' },
  travel: { backgroundColor: '#9333EA' },
  family: { backgroundColor: '#DB2777' },
  receipts: { backgroundColor: '#EA580C' },
  newsletters: { backgroundColor: '#0891B2' },
  projects: { backgroundColor: '#4F46E5' },
})

function current<T>(ref: RefObject<T | null>): T {
  if (ref.current === null) throw new Error('ref is not attached')
  return ref.current
}

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
  return AVATAR_COLORS[hash % 8]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
}

type MessageAvatarProps = { name: string; size: 'small' | 'large'; xstyle?: StyleXStyles }

function MessageAvatar(props: MessageAvatarProps) {
  const large = props.size === 'large'
  return (
    <Avatar.Root
      {...stylex.props(
        styles.avatar,
        large ? styles.avatarLarge : styles.avatarSmall,
        avatarColor(props.name),
        props.xstyle,
      )}
    >
      <Avatar.Fallback
        {...stylex.props(styles.avatarInitials, large ? styles.avatarInitialsLarge : styles.avatarInitialsSmall)}
      >
        {initials(props.name)}
      </Avatar.Fallback>
    </Avatar.Root>
  )
}

function Sidebar(props: { unreadCount: number }) {
  return (
    <div {...stylex.props(styles.sidebar)}>
      <div {...stylex.props(styles.brand)}>
        <div {...stylex.props(styles.brandName)}>Mailbox</div>
      </div>
      {FOLDERS.map((name) => {
        const selected = name === 'Inbox'
        return (
          <Button
            key={name}
            nativeButton={false}
            render={<div />}
            {...stylex.props(styles.folder, selected && styles.folderSelected)}
          >
            <div {...stylex.props(styles.folderName)}>{name}</div>
            <div {...stylex.props(styles.folderCount)}>
              {formatCount(selected ? props.unreadCount : FOLDER_COUNTS[name])}
            </div>
          </Button>
        )
      })}
      <div {...stylex.props(styles.labelsHeading)}>
        <div {...stylex.props(styles.labelsHeadingText)}>LABELS</div>
      </div>
      {LABELS.map((label) => (
        <div key={label.name} {...stylex.props(styles.label)}>
          <div {...stylex.props(styles.labelDot, labelColors[label.style])} />
          <div {...stylex.props(styles.labelName)}>{label.name}</div>
        </div>
      ))}
    </div>
  )
}

type RowProps = {
  message: Message
  index: number
  top: number
  selected: boolean
  onSelect: (index: number) => void
}

function Row(props: RowProps) {
  const message = props.message
  return (
    <div
      {...stylex.props(styles.row, props.selected && styles.rowSelected)}
      style={{ transform: `translateY(${props.top}px)` }}
      onClick={() => props.onSelect(props.index)}
    >
      {message.unread && <div {...stylex.props(styles.unreadDot)} />}
      <MessageAvatar name={message.fromName} size="small" xstyle={styles.rowAvatar} />
      <div {...stylex.props(styles.rowText)}>
        <div {...stylex.props(styles.rowHeader)}>
          <div {...stylex.props(styles.oneLine, styles.sender, message.unread && styles.senderUnread)}>
            {message.fromName}
          </div>
          <div {...stylex.props(styles.time)}>{message.time}</div>
        </div>
        <div {...stylex.props(styles.oneLine, styles.subject)}>{message.subject}</div>
        <div {...stylex.props(styles.oneLine, styles.snippet)}>{message.snippet}</div>
      </div>
    </div>
  )
}

type DetailProps = { message: Message | undefined; viewportRef: Ref<HTMLDivElement> }

function Detail(props: DetailProps) {
  const message = props.message
  return (
    <ScrollArea.Root {...stylex.props(styles.detail)}>
      <ScrollArea.Viewport ref={props.viewportRef} {...stylex.props(styles.viewport)}>
        <ScrollArea.Content {...stylex.props(styles.detailContent)}>
          {message === undefined ? (
            <div {...stylex.props(styles.empty)}>
              <div {...stylex.props(styles.emptyText)}>No message selected</div>
            </div>
          ) : (
            <div key={message.id} {...stylex.props(styles.message)}>
              <div {...stylex.props(styles.title)}>{message.subject}</div>
              <div {...stylex.props(styles.byline)}>
                <MessageAvatar name={message.fromName} size="large" />
                <div {...stylex.props(styles.bylineText)}>
                  <div {...stylex.props(styles.bylineName)}>{message.fromName}</div>
                  <div {...stylex.props(styles.bylineEmail)}>{message.fromEmail}</div>
                </div>
                <div {...stylex.props(styles.dateLong)}>{message.dateLong}</div>
              </div>
              <div {...stylex.props(styles.body)}>
                {message.body.map((paragraph, index) => (
                  <div key={index} {...stylex.props(styles.paragraph)}>
                    {paragraph}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" {...stylex.props(styles.scrollbar)}>
        <ScrollArea.Thumb {...stylex.props(styles.thumb)} />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}

export function App(props: { messages: Message[] }) {
  const messages = props.messages
  const haystacks = messages.map((message) => `${message.fromName} ${message.subject} ${message.snippet}`.toLowerCase())
  const unreadCount = messages.filter((message) => message.unread).length

  const [text, setText] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const listRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const query = text.trim().toLowerCase()
  const results = query === '' ? messages : messages.filter((_, index) => haystacks[index].includes(query))
  const selected = results[selectedIndex]

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  function select(index: number) {
    setSelectedIndex(index)
    current(detailRef).scrollTo({ top: 0 })
  }

  function filter(value: string) {
    setText(value)
    setSelectedIndex(0)
    current(listRef).scrollTop = 0
    current(detailRef).scrollTo({ top: 0 })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const count = results.length
      if (count === 0) return
      const next = Math.min(count - 1, Math.max(0, selectedIndex + (event.key === 'ArrowDown' ? 1 : -1)))
      select(next)
      virtualizer.scrollToIndex(next, { align: 'auto' })
    } else if (event.key === 'Escape') {
      filter('')
    }
  }

  return (
    <div {...stylex.props(styles.app)}>
      <Sidebar unreadCount={unreadCount} />
      <div {...stylex.props(styles.listPane)}>
        <div {...stylex.props(styles.searchBar)}>
          <Input
            autoFocus
            value={text}
            placeholder="Search mail"
            onValueChange={filter}
            onKeyDown={onKeyDown}
            {...stylex.props(styles.search)}
          />
        </div>
        <div {...stylex.props(styles.summary)}>
          <div {...stylex.props(styles.summaryText)}>{`${numberFormat.format(results.length)} conversations`}</div>
        </div>
        <div ref={listRef} {...stylex.props(styles.list)}>
          <div {...stylex.props(styles.listInner)} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => (
              <Row
                key={item.key}
                message={results[item.index]}
                index={item.index}
                top={item.start}
                selected={item.index === selectedIndex}
                onSelect={select}
              />
            ))}
          </div>
        </div>
      </div>
      <Detail message={selected} viewportRef={detailRef} />
    </div>
  )
}
