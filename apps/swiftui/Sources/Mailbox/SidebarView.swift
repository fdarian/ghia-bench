import SwiftUI

private struct Folder: Identifiable {
    let name: String
    let count: Int?
    var id: String { name }
}

private struct Label: Identifiable {
    let name: String
    let color: Color
    var id: String { name }
}

private let labels: [Label] = [
    Label(name: "Work", color: Color(hex: 0x2563EB)),
    Label(name: "Personal", color: Color(hex: 0x16A34A)),
    Label(name: "Finance", color: Color(hex: 0xCA8A04)),
    Label(name: "Travel", color: Color(hex: 0x9333EA)),
    Label(name: "Family", color: Color(hex: 0xDB2777)),
    Label(name: "Receipts", color: Color(hex: 0xEA580C)),
    Label(name: "Newsletters", color: Color(hex: 0x0891B2)),
    Label(name: "Projects", color: Color(hex: 0x4F46E5)),
]

struct SidebarView: View {
    let unreadCount: Int

    private var folders: [Folder] {
        [
            Folder(name: "Inbox", count: unreadCount),
            Folder(name: "Starred", count: 24),
            Folder(name: "Sent", count: 128),
            Folder(name: "Drafts", count: 3),
            Folder(name: "Archive", count: 2048),
            Folder(name: "Spam", count: 12),
            Folder(name: "Trash", count: nil),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Mailbox")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .padding(.leading, 16)
                .frame(height: 48, alignment: .leading)

            VStack(spacing: 0) {
                ForEach(folders) { folder in
                    FolderRow(folder: folder, isSelected: folder.name == "Inbox")
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 8)

            Text("LABELS")
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.5)
                .foregroundStyle(Palette.faint)
                .padding(.leading, 16)
                .frame(height: 24, alignment: .leading)
                .padding(.top, 16)

            VStack(spacing: 0) {
                ForEach(labels) { label in
                    HStack(spacing: 8) {
                        Circle().fill(label.color).frame(width: 8, height: 8)
                        Text(label.name)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.inkMedium)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 8)
                    .frame(height: 28)
                }
            }
            .padding(.horizontal, 8)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.surface)
        .overlay(alignment: .trailing) {
            Rectangle().fill(Palette.border).frame(width: 1)
        }
    }
}

private struct FolderRow: View {
    let folder: Folder
    let isSelected: Bool
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 0) {
            Text(folder.name)
                .font(.system(size: 13))
                .foregroundStyle(Palette.inkStrong)
                .lineLimit(1)
            Spacer(minLength: 0)
            if let count = folder.count, count > 0 {
                Text(count.withThousandsSeparator)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 32)
        .background(
            RoundedRectangle(cornerRadius: 6).fill(background)
        )
        .onHover { isHovered = $0 }
    }

    private var background: Color {
        if isSelected { return Palette.border }
        return isHovered ? Palette.hoverFolder : .clear
    }
}
