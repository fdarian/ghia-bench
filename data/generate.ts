// Seeded generator for data/messages.json. Deterministic: the same seed yields byte-identical output.
// Vocabulary frequencies are tuned so typing "quarterly report" char by char narrows the match count
// from thousands (at "q") to a few dozen (full query).

const SEED = 42;
const COUNT = 10_000;
const SENDERS = 200;
const REFERENCE = { year: 2026, month: 11, day: 5 };
const START = Date.UTC(2026, 10, 5, 15, 40);
const OUT = new URL("./messages.json", import.meta.url).pathname;
const QUERY = "quarterly report";

const LABELS = ["work", "personal", "finance", "travel", "family", "receipts", "newsletters", "projects"];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const uniform = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
// Earlier entries are picked more often.
const skewed = <T>(list: T[]) => list[Math.floor(list.length * rand() ** 1.7)];

const FIRST = [
  "Alice", "Brandon", "Chloe", "Daniel", "Elena", "Felix", "Grace", "Hassan", "Isabel", "Jonas",
  "Keiko", "Liam", "Maya", "Nikhil", "Olivia", "Pedro", "Quinn", "Rosa", "Samuel", "Tara",
  "Umar", "Vera", "Wei", "Ximena", "Yusuf",
];
const LAST = [
  "Anderson", "Bennett", "Castillo", "Dubois", "Eriksen", "Fischer", "Gupta", "Hoffman", "Ivanov",
  "Jensen", "Kowalski", "Lindgren", "Moreau", "Nakamura", "Okafor", "Petrov",
];

const DET = ["the", "our", "this", "your", "the new", "last week's", "that", "each", "every", "a"];
const ADJ = [
  "final", "draft", "annual", "new", "updated", "shared", "internal", "weekly", "monthly",
  "urgent", "revised", "preliminary", "external", "pending", "approved", "open", "regional", "detailed",
  "upcoming", "recent", "full", "short", "long", "clear", "simple", "careful", "early", "late", "main",
  "second", "third", "joint", "public", "private", "manual", "automatic", "mobile", "local", "global",
];
const NOUN = [
  "meeting", "budget", "invoice", "schedule", "proposal", "project", "report", "review", "update", "plan",
  "summary", "agenda", "contract", "deadline", "ticket", "release", "design", "feedback", "forecast",
  "roadmap", "survey", "account", "payment", "order", "shipment", "reservation", "itinerary", "receipt",
  "statement", "policy", "document", "presentation", "workshop", "interview", "offer", "team", "client",
  "vendor", "partner", "customer", "launch", "campaign", "metric", "dashboard", "analysis", "audit",
  "checklist", "milestone", "backlog", "sprint", "request", "question", "quote", "quarter", "revenue",
  "results", "target", "goal", "risk", "issue", "change", "version", "build", "branch", "patch", "server",
  "database", "network", "service", "contract", "expense", "salary", "tax form", "booking", "flight",
  "hotel", "dinner", "party", "birthday", "wedding", "trip", "photo", "recipe", "newsletter", "digest",
  "notice", "reminder", "alert", "confirmation", "renewal", "subscription", "warranty", "delivery",
  "package", "refund", "discount", "promotion", "event", "conference", "webinar", "training", "course",
  "lesson", "assignment", "grade", "essay", "paper", "draft", "outline", "notes", "minutes", "slides",
  "spreadsheet", "model", "estimate", "approval", "access", "permission", "password", "security",
  "incident", "outage", "migration", "upgrade", "license", "inventory", "equipment", "supplier",
  "sequence", "frequency", "quality", "inquiry", "technique", "squad", "standup", "retro", "demo",
  "pilot", "trial", "rollout", "hiring", "onboarding", "benefits", "payroll", "timeline", "scope",
  "dependency", "blocker", "decision", "proposal", "thread", "channel", "calendar", "invite", "location",
];
const VERB = [
  "covers", "needs", "includes", "shows", "explains", "requires", "confirms", "changes", "affects",
  "follows", "supports", "blocks", "improves", "replaces", "outlines", "matches", "reflects", "tracks",
  "describes", "highlights", "delays", "unlocks", "extends", "reviews", "approves", "sends", "moves",
  "mentions", "adds", "removes", "fixes", "breaks", "answers", "raises", "closes", "opens", "starts",
  "ends", "depends on", "waits for",
];
const PREP = ["for", "about", "before", "after", "with", "from", "during", "ahead of", "instead of", "alongside"];
const INTRO = [
  "Just a quick note:", "Heads up:", "Following up:", "As discussed,", "Quick question:", "FYI,", "Reminder:",
  "Per our call,", "Looking ahead,", "On reflection,", "To be clear,", "Good news:", "Unfortunately,",
  "Thanks again,", "One more thing:",
];
const CLOSER = [
  "Let me know what you think.", "Happy to jump on a call.", "Thanks for your help.", "Talk soon.",
  "No rush on this.", "I will follow up tomorrow.", "Please reply when you can.", "See you on Thursday.",
  "Appreciate the quick turnaround.", "Looking forward to it.",
];

function phrase(): string {
  const r = rand();
  if (r < 0.008) return `${skewed(DET)} quarterly ${skewed(NOUN)}`;
  if (r < 0.0085) return `${skewed(DET)} quarterly report`;
  if (r < 0.5) return `${skewed(DET)} ${skewed(NOUN)}`;
  return `${skewed(DET)} ${skewed(ADJ)} ${skewed(NOUN)}`;
}

function sentence(): string {
  const shape = int(0, 7);
  let text: string;
  switch (shape) {
    case 0:
      text = `${phrase()} ${skewed(VERB)} ${skewed(NOUN)}`;
      break;
    case 1:
      text = `${uniform(INTRO)} ${skewed(NOUN)} ${skewed(VERB)} ${skewed(NOUN)}`;
      break;
    case 2:
      text = `${skewed(DET)} ${skewed(NOUN)} ${skewed(VERB)} ${uniform(PREP)} ${skewed(NOUN)}`;
      break;
    case 3:
      text = `${skewed(NOUN)} ${skewed(VERB)} ${phrase()}`;
      break;
    case 4:
    case 5:
      return uniform(CLOSER);
    case 6:
      text = `${skewed(NOUN)} ${skewed(VERB)} ${skewed(NOUN)}`;
      break;
    default:
      text = `${phrase()} ${skewed(VERB)} ${skewed(NOUN)}`;
  }
  const trimmed = text.trim();
  return trimmed[0].toUpperCase() + trimmed.slice(1) + (trimmed.endsWith(":") ? "" : ".");
}

// Subjects carry most of the "quarterly report" hits: a few explicit templates plus loose combinations.
function subject(): string {
  const r = rand();
  let text: string;
  if (r < 0.002) text = `Quarterly report ${uniform(["draft", "final", "Q3", "Q4", "numbers", "for review", "attached", "feedback"])}`;
  else if (r < 0.0035) text = `Re: quarterly report ${uniform(["update", "questions", "deadline", "schedule"])}`;
  else if (r < 0.04) text = `Quarterly ${uniform(["review", "results", "revenue", "roadmap", "rollout", "reminder", "planning", "priorities", "budget", "metrics", "targets", "retro", "survey", "forecast", "numbers"])}`;
  else if (r < 0.08) text = `${uniform(["Weekly", "Annual", "Monthly", "Final", "Draft", "Updated", "Status", "Incident", "Sales", "Expense"])} report ${uniform(["attached", "for review", "ready", "due Friday", "notes"])}`;
  else if (r < 0.12) text = `${uniform(["Question about", "Request:", "Quote for", "Invoice for", "Re:", "Fwd:"])} ${skewed(ADJ)} ${skewed(NOUN)}`;
  else text = `${skewed(ADJ)} ${skewed(NOUN)} ${uniform(PREP)} ${skewed(DET)} ${skewed(NOUN)}`;
  const trimmed = text.trim();
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function body(): string[] {
  const paragraphs: string[] = [];
  const count = int(3, 8);
  for (let p = 0; p < count; p++) {
    const sentences: string[] = [];
    const n = int(2, 5);
    for (let s = 0; s < n; s++) sentences.push(sentence());
    paragraphs.push(sentences.join(" "));
  }
  return paragraphs;
}

const senders = Array.from({ length: SENDERS }, (_, i) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[Math.floor(i / FIRST.length) % LAST.length];
  const suffix = i >= FIRST.length * LAST.length ? String(i) : "";
  return {
    name: `${first} ${last}${suffix}`,
    email: `${first}.${last}${suffix}@example.com`.toLowerCase(),
  };
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");

function formatTime(date: Date): string {
  const sameDay =
    date.getUTCFullYear() === REFERENCE.year && date.getUTCMonth() + 1 === REFERENCE.month && date.getUTCDate() === REFERENCE.day;
  if (sameDay) return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
}

function formatLong(date: Date): string {
  return `${DAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} at ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

interface Message {
  id: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  body: string[];
  time: string;
  dateLong: string;
  unread: boolean;
  labels: string[];
}

const messages: Message[] = [];
let stamp = START;
for (let i = 0; i < COUNT; i++) {
  const sender = skewedSender();
  const paragraphs = body();
  const date = new Date(stamp);
  const labelCount = rand() < 0.5 ? 0 : rand() < 0.7 ? 1 : 2;
  const labels: string[] = [];
  while (labels.length < labelCount) {
    const label = uniform(LABELS);
    if (!labels.includes(label)) labels.push(label);
  }
  messages.push({
    id: i + 1,
    fromName: sender.name,
    fromEmail: sender.email,
    subject: subject(),
    snippet: paragraphs.join(" ").slice(0, 140),
    body: paragraphs,
    time: formatTime(date),
    dateLong: formatLong(date),
    unread: rand() < 0.3,
    labels,
  });
  stamp -= Math.max(1, Math.round(-Math.log(1 - rand()) * 60)) * 60_000;
}

function skewedSender() {
  return senders[Math.floor(SENDERS * rand() ** 1.3)];
}

await Bun.write(OUT, JSON.stringify(messages));

const haystacks = messages.map((m) => `${m.fromName} ${m.subject} ${m.snippet}`.toLowerCase());
console.log(`wrote ${messages.length} messages, ${(Bun.file(OUT).size / 1e6).toFixed(2)} MB, ${new Set(messages.map((m) => m.fromName)).size} senders`);
for (let n = 1; n <= QUERY.length; n++) {
  const query = QUERY.slice(0, n).trim().toLowerCase();
  const matches = haystacks.filter((h) => h.includes(query)).length;
  console.log(`${JSON.stringify(QUERY.slice(0, n)).padEnd(20)} ${matches}`);
}
