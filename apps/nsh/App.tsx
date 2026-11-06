import { batch, computed, keymap, List, mount, Scroll, signal, Text, View } from "nsh";
import type { InputRef, ListRef, ScrollRef, TextStyle } from "nsh";
import { Input } from "nsh/base";
import { Window } from "nsh/desktop";
import { loadMessages } from "./data";
import type { Message } from "./types";

const ROW_HEIGHT = 72;
// Standard macOS title bar: setFrame's size is the outer frame, the content area must come out 1280x800.
const TITLE_BAR_HEIGHT = 28;

const FOLDERS = ["Inbox", "Starred", "Sent", "Drafts", "Archive", "Spam", "Trash"];
const FOLDER_COUNTS: Record<string, number> = {
  Starred: 24,
  Sent: 128,
  Drafts: 3,
  Archive: 2048,
  Spam: 12,
  Trash: 0,
};

const LABELS = [
  { name: "Work", color: "#2563EB" },
  { name: "Personal", color: "#16A34A" },
  { name: "Finance", color: "#CA8A04" },
  { name: "Travel", color: "#9333EA" },
  { name: "Family", color: "#DB2777" },
  { name: "Receipts", color: "#EA580C" },
  { name: "Newsletters", color: "#0891B2" },
  { name: "Projects", color: "#4F46E5" },
];

const AVATAR_COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA", "#F472B6"];

// No Intl in QuickJS.
const formatNumber = (count: number) => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const formatCount = (count: number) => (count === 0 ? "" : formatNumber(count));

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[hash % 8];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

const oneLine: TextStyle = { numberOfLines: 1, textOverflow: "ellipsis" };

function Avatar(props: { name: string; size: number; fontSize: number; style?: TextStyle }) {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: props.size,
        height: props.size,
        borderRadius: props.size / 2,
        backgroundColor: avatarColor(props.name),
        ...props.style,
      }}
    >
      <Text style={{ fontSize: props.fontSize, fontWeight: "600", color: "#FFFFFF" }}>{initials(props.name)}</Text>
    </View>
  );
}

function Sidebar(props: { unreadCount: number }) {
  return (
    <View
      style={{
        flexShrink: 0,
        width: 220,
        height: "100%",
        backgroundColor: "#F4F4F5",
        borderRightWidth: 1,
        borderRightColor: "#E4E4E7",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0, height: 48, marginBottom: 8, paddingLeft: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: "#18181B" }}>Mailbox</Text>
      </View>
      <Each of={FOLDERS}>
        {(name) => {
          const selected = name() === "Inbox";
          return (
            <View
              hoverStyle={{ backgroundColor: selected ? "#E4E4E7" : "#EBEBED" }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
                height: 32,
                marginHorizontal: 8,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: selected ? "#E4E4E7" : undefined,
              }}
            >
              <Text style={{ fontSize: 13, color: "#27272A" }}>{name()}</Text>
              <Text style={{ fontSize: 12, color: "#71717A" }}>
                {formatCount(selected ? props.unreadCount : FOLDER_COUNTS[name()])}
              </Text>
            </View>
          );
        }}
      </Each>
      <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0, height: 24, marginTop: 16, paddingLeft: 16 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: "#A1A1AA", letterSpacing: 0.5 }}>LABELS</Text>
      </View>
      <Each of={LABELS}>
        {(label) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexShrink: 0,
              gap: 8,
              height: 28,
              marginHorizontal: 8,
              paddingHorizontal: 8,
            }}
          >
            <View style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 4, backgroundColor: label().color }} />
            <Text style={{ fontSize: 13, color: "#3F3F46" }}>{label().name}</Text>
          </View>
        )}
      </Each>
    </View>
  );
}

function Row(props: { message: Message; selected: boolean; onSelect: () => void }) {
  return (
    <View
      onPress={props.onSelect}
      hoverStyle={{ backgroundColor: props.selected ? "#DBEAFE" : "#F4F4F5" }}
      style={{
        height: ROW_HEIGHT,
        borderBottomWidth: 1,
        borderBottomColor: "#F4F4F5",
        backgroundColor: props.selected ? "#DBEAFE" : undefined,
      }}
    >
      <If when={props.message.unread}>
        <View style={{ position: "absolute", left: 4, top: 17, width: 8, height: 8, borderRadius: 4, backgroundColor: "#2563EB" }} />
      </If>
      <Avatar name={props.message.fromName} size={36} fontSize={13} style={{ position: "absolute", left: 16, top: 12 }} />
      <View style={{ position: "absolute", left: 64, right: 16, top: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, height: 18 }}>
          <Text
            style={{
              ...oneLine,
              flexShrink: 1,
              minWidth: 0,
              fontSize: 13,
              fontWeight: props.message.unread ? "600" : "500",
              color: props.message.unread ? "#18181B" : "#3F3F46",
            }}
          >
            {props.message.fromName}
          </Text>
          <Text style={{ flexShrink: 0, fontSize: 12, color: "#71717A" }}>{props.message.time}</Text>
        </View>
        <Text style={{ ...oneLine, height: 18, lineHeight: 18, fontSize: 13, color: "#27272A" }}>{props.message.subject}</Text>
        <Text style={{ ...oneLine, height: 16, lineHeight: 16, fontSize: 12, color: "#71717A" }}>{props.message.snippet}</Text>
      </View>
    </View>
  );
}

function Detail(props: { message: Message | undefined; scrollRef: (element: ScrollRef) => void }) {
  return (
    <Scroll ref={props.scrollRef} contentStyle={{ flexGrow: 1, padding: 32 }} style={{ flexGrow: 1, minWidth: 0, height: "100%", backgroundColor: "#FFFFFF" }}>
      <If
        when={props.message}
        else={
          <View style={{ alignItems: "center", justifyContent: "center", flexGrow: 1 }}>
            <Text style={{ fontSize: 14, color: "#A1A1AA" }}>No message selected</Text>
          </View>
        }
      >
        {(message) => (
          <View style={{ flexShrink: 0 }}>
            <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: "600", color: "#18181B" }}>{message().subject}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, height: 40, marginTop: 16 }}>
              <Avatar name={message().fromName} size={40} fontSize={15} />
              <View style={{ flexGrow: 1, minWidth: 0 }}>
                <Text style={{ height: 20, lineHeight: 20, fontSize: 14, fontWeight: "600", color: "#18181B" }}>{message().fromName}</Text>
                <Text style={{ height: 20, lineHeight: 20, fontSize: 13, color: "#71717A" }}>{message().fromEmail}</Text>
              </View>
              <Text style={{ flexShrink: 0, fontSize: 12, color: "#71717A" }}>{message().dateLong}</Text>
            </View>
            <View style={{ gap: 14, marginTop: 24 }}>
              <Each of={message().body}>
                {(paragraph) => <Text style={{ fontSize: 14, lineHeight: 22, color: "#27272A" }}>{paragraph()}</Text>}
              </Each>
            </View>
          </View>
        )}
      </If>
    </Scroll>
  );
}

function App(props: { messages: Message[] }) {
  const haystacks = props.messages.map((message) => `${message.fromName} ${message.subject} ${message.snippet}`.toLowerCase());
  const unreadCount = props.messages.filter((message) => message.unread).length;

  const text = signal("");
  const selectedIndex = signal(0);
  let listScrollTop = 0;
  let listHeight = 0;

  let list!: ListRef;
  let detail!: ScrollRef;
  let search!: InputRef;

  const results = computed(() => {
    const query = text().trim().toLowerCase();
    if (query === "") return props.messages;
    return props.messages.filter((_, index) => haystacks[index].includes(query));
  });
  const selected = computed(() => results()[selectedIndex()]);

  function scrollListTo(offset: number) {
    listScrollTop = offset;
    list.scrollToOffset({ offset });
  }

  function select(index: number) {
    selectedIndex.set(index);
    detail.scrollTo({ y: 0 });
  }

  function filter(value: string) {
    batch(() => {
      text.set(value);
      selectedIndex.set(0);
    });
    scrollListTo(0);
    detail.scrollTo({ y: 0 });
  }

  function reveal(index: number) {
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < listScrollTop) scrollListTo(top);
    else if (bottom > listScrollTop + listHeight) scrollListTo(bottom - listHeight);
  }

  function step(delta: number) {
    const count = results().length;
    if (count === 0) return;
    const next = Math.min(count - 1, Math.max(0, selectedIndex() + delta));
    select(next);
    reveal(next);
  }

  keymap.bind("down", () => step(1), { when: "always", repeat: true });
  keymap.bind("up", () => step(-1), { when: "always", repeat: true });
  keymap.bind(
    "escape",
    () => {
      filter("");
      search.focus();
    },
    { when: "always" },
  );

  return (
    <View style={{ flexDirection: "row", width: "100%", height: "100%", backgroundColor: "#FFFFFF" }}>
      <Sidebar unreadCount={unreadCount} />
      <View style={{ flexShrink: 0, width: 420, height: "100%", backgroundColor: "#FFFFFF", borderRightWidth: 1, borderRightColor: "#E4E4E7" }}>
        <View style={{ flexShrink: 0, height: 56, padding: 12 }}>
          <Input
            ref={search}
            autoFocus
            value={text()}
            placeholder="Search mail"
            onChange={(event) => filter(event.value)}
            focusStyle={{ borderColor: "#2563EB" }}
            style={{
              width: 396,
              height: 32,
              paddingHorizontal: 10,
              fontSize: 13,
              color: "#18181B",
              placeholderColor: "#A1A1AA",
              caretColor: "#18181B",
              backgroundColor: "#F4F4F5",
              borderWidth: 1,
              borderColor: "#E4E4E7",
              borderRadius: 8,
            }}
          />
        </View>
        <View style={{ flexShrink: 0, height: 28, justifyContent: "center", paddingLeft: 16 }}>
          <Text style={{ fontSize: 12, color: "#71717A" }}>{`${formatNumber(results().length)} conversations`}</Text>
        </View>
        <List
          ref={list}
          each={results()}
          estimatedItemSize={ROW_HEIGHT}
          onScroll={(event) => (listScrollTop = event.offset.y)}
          onLayout={(event) => (listHeight = event.bounds.size.height)}
          style={{ flexGrow: 1, minHeight: 0 }}
        >
          {(message, index) => (
            <Row message={message()} selected={selected() === message()} onSelect={() => select(index())} />
          )}
        </List>
      </View>
      <Detail message={selected()} scrollRef={(element) => (detail = element)} />
    </View>
  );
}

Window.setTitle("Mailbox");
Window.setFrame({ origin: { x: 100, y: 100 }, size: { width: 1280, height: 800 + TITLE_BAR_HEIGHT } });

const messages = await loadMessages();
mount(() => <App messages={messages} />);
