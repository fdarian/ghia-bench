import Foundation
import Observation

struct Message: Identifiable, Sendable, Decodable {
    let id: Int
    let fromName: String
    let fromEmail: String
    let subject: String
    let snippet: String
    let body: [String]
    let time: String
    let dateLong: String
    let unread: Bool
    let haystack: String
    let initials: String
    let avatarIndex: Int

    private enum CodingKeys: String, CodingKey {
        case id, fromName, fromEmail, subject, snippet, body, time, dateLong, unread
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        fromName = try container.decode(String.self, forKey: .fromName)
        fromEmail = try container.decode(String.self, forKey: .fromEmail)
        subject = try container.decode(String.self, forKey: .subject)
        snippet = try container.decode(String.self, forKey: .snippet)
        body = try container.decode([String].self, forKey: .body)
        time = try container.decode(String.self, forKey: .time)
        dateLong = try container.decode(String.self, forKey: .dateLong)
        unread = try container.decode(Bool.self, forKey: .unread)
        haystack = "\(fromName) \(subject) \(snippet)".lowercased()
        initials = String(fromName.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first))
        avatarIndex = fromName.utf16.reduce(0) { $0 + Int($1) } % 8
    }
}

enum ListScroll: Equatable {
    case top(generation: Int)
    case reveal(id: Int, generation: Int)
}

@MainActor @Observable
final class MailboxModel {
    private let all: [Message]
    let unreadCount: Int

    private(set) var results: [Message]
    private(set) var selectedIndex: Int?
    private(set) var listScroll: ListScroll = .top(generation: 0)
    private(set) var detailGeneration = 0

    var query = "" {
        didSet { applyFilter() }
    }

    var selected: Message? {
        selectedIndex.map { results[$0] }
    }

    init() {
        guard let url = Bundle.main.url(forResource: "messages", withExtension: "json") else {
            fatalError("messages.json is missing from the bundle Resources")
        }
        do {
            all = try JSONDecoder().decode([Message].self, from: Data(contentsOf: url))
        } catch {
            fatalError("messages.json could not be read: \(error)")
        }
        unreadCount = all.reduce(0) { $0 + ($1.unread ? 1 : 0) }
        results = all
        selectedIndex = all.isEmpty ? nil : 0
    }

    func select(id: Int) {
        guard let index = results.firstIndex(where: { $0.id == id }) else { return }
        selectedIndex = index
        detailGeneration += 1
    }

    func moveSelection(by delta: Int) {
        guard let current = selectedIndex else { return }
        let next = min(max(current + delta, 0), results.count - 1)
        selectedIndex = next
        detailGeneration += 1
        listScroll = .reveal(id: results[next].id, generation: detailGeneration)
    }

    func clearSearch() {
        query = ""
    }

    private func applyFilter() {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        results = needle.isEmpty ? all : all.filter { $0.haystack.contains(needle) }
        selectedIndex = results.isEmpty ? nil : 0
        detailGeneration += 1
        listScroll = .top(generation: detailGeneration)
    }
}

extension Int {
    var withThousandsSeparator: String {
        formatted(.number.locale(Locale(identifier: "en_US")))
    }
}
