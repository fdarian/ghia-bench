use std::path::PathBuf;

use gpui::{rgb, Rgba, SharedString};
use serde::Deserialize;

const AVATAR_COLORS: [u32; 8] = [
    0xF87171, 0xFB923C, 0xFBBF24, 0x34D399, 0x22D3EE, 0x60A5FA, 0xA78BFA, 0xF472B6,
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawMessage {
    from_name: String,
    from_email: String,
    subject: String,
    snippet: String,
    body: Vec<String>,
    time: String,
    date_long: String,
    unread: bool,
}

pub struct Message {
    pub from_name: SharedString,
    pub from_email: SharedString,
    pub subject: SharedString,
    pub snippet: SharedString,
    pub body: Vec<SharedString>,
    pub time: SharedString,
    pub date_long: SharedString,
    pub unread: bool,
    pub initials: SharedString,
    pub avatar: Rgba,
    pub haystack: String,
}

impl From<RawMessage> for Message {
    fn from(raw: RawMessage) -> Self {
        let initials: String = raw
            .from_name
            .split_whitespace()
            .take(2)
            .filter_map(|word| word.chars().next())
            .collect();
        let hash: u32 = raw.from_name.encode_utf16().map(u32::from).sum();
        let haystack = format!("{} {} {}", raw.from_name, raw.subject, raw.snippet).to_lowercase();
        Message {
            from_name: raw.from_name.into(),
            from_email: raw.from_email.into(),
            subject: raw.subject.into(),
            snippet: raw.snippet.into(),
            body: raw.body.into_iter().map(SharedString::from).collect(),
            time: raw.time.into(),
            date_long: raw.date_long.into(),
            unread: raw.unread,
            initials: initials.into(),
            avatar: rgb(AVATAR_COLORS[(hash % 8) as usize]),
            haystack,
        }
    }
}

pub fn load_messages() -> Vec<Message> {
    let exe = std::env::current_exe().expect("current executable path");
    let path: PathBuf = exe
        .parent()
        .expect("executable directory")
        .join("../Resources/messages.json");
    let json = std::fs::read(&path).unwrap_or_else(|e| panic!("reading {}: {e}", path.display()));
    let raw: Vec<RawMessage> = serde_json::from_slice(&json).expect("parsing messages.json");
    raw.into_iter().map(Message::from).collect()
}
