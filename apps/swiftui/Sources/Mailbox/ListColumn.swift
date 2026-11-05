import SwiftUI

struct ListColumn: View {
    let model: MailboxModel

    var body: some View {
        VStack(spacing: 0) {
            SearchField(model: model)
            Text("\(model.results.count.withThousandsSeparator) conversations")
                .font(.system(size: 12))
                .foregroundStyle(Palette.muted)
                .padding(.leading, 16)
                .frame(maxWidth: .infinity, minHeight: 28, maxHeight: 28, alignment: .leading)
            MessageList(model: model)
        }
        .background(Color.white)
        .overlay(alignment: .trailing) {
            Rectangle().fill(Palette.border).frame(width: 1)
        }
    }
}

private struct SearchField: View {
    @Bindable var model: MailboxModel
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField(
            "Search mail", text: $model.query,
            prompt: Text("Search mail").foregroundStyle(Palette.faint)
        )
        .textFieldStyle(.plain)
        .font(.system(size: 13))
        .foregroundStyle(Palette.ink)
        .tint(Palette.ink)
        .focused($isFocused)
        .focusEffectDisabled()
        .padding(.leading, 11)
        .padding(.trailing, 10)
        .frame(width: 396, height: 32)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(isFocused ? Palette.accent : Palette.border, lineWidth: 1)
        )
        .padding(12)
        .frame(width: 420, height: 56, alignment: .topLeading)
        .defaultFocus($isFocused, true)
        .task { isFocused = true }
        .onKeyPress(.downArrow) {
            model.moveSelection(by: 1)
            return .handled
        }
        .onKeyPress(.upArrow) {
            model.moveSelection(by: -1)
            return .handled
        }
        .onKeyPress(.escape) {
            model.clearSearch()
            return .handled
        }
    }
}

private struct MessageList: View {
    let model: MailboxModel

    var body: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(model.results) { message in
                    MessageRow(
                        message: message,
                        isSelected: message.id == model.selected?.id,
                        select: { model.select(id: message.id) }
                    )
                    .listRowInsets(EdgeInsets(top: 0, leading: -8, bottom: 0, trailing: -8))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .alternatingRowBackgrounds(.disabled)
            .environment(\.defaultMinListRowHeight, 72)
            .contentMargins(0, for: .scrollContent)
            .onChange(of: model.listScroll) { _, request in
                switch request {
                case .top:
                    if let first = model.results.first {
                        proxy.scrollTo(first.id, anchor: .top)
                    }
                case .reveal(let id, _):
                    proxy.scrollTo(id)
                }
            }
        }
    }
}

private struct MessageRow: View {
    let message: Message
    let isSelected: Bool
    let select: () -> Void
    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Text(message.fromName)
                    .font(.system(size: 13, weight: message.unread ? .semibold : .medium))
                    .foregroundStyle(message.unread ? Palette.ink : Palette.inkMedium)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 8)
                Text(message.time)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
            .frame(height: 18)
            Text(message.subject)
                .font(.system(size: 13))
                .foregroundStyle(Palette.inkStrong)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, minHeight: 18, maxHeight: 18, alignment: .leading)
            Text(message.snippet)
                .font(.system(size: 12))
                .foregroundStyle(Palette.muted)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, minHeight: 16, maxHeight: 16, alignment: .leading)
        }
        .padding(.leading, 64)
        .padding(.trailing, 16)
        .padding(.top, 12)
        .frame(maxWidth: .infinity, minHeight: 72, maxHeight: 72, alignment: .topLeading)
        .background(background)
        .overlay(alignment: .topLeading) {
            Avatar(message: message, size: 36, fontSize: 13)
                .offset(x: 16, y: 12)
        }
        .overlay(alignment: .topLeading) {
            if message.unread {
                Circle().fill(Palette.accent).frame(width: 8, height: 8).offset(x: 4, y: 17)
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(Palette.surface).frame(height: 1)
        }
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
        .onTapGesture(perform: select)
    }

    private var background: Color {
        if isSelected { return Palette.selectedRow }
        return isHovered ? Palette.surface : .white
    }
}

struct Avatar: View {
    let message: Message
    let size: CGFloat
    let fontSize: CGFloat

    var body: some View {
        Circle()
            .fill(Palette.avatars[message.avatarIndex])
            .frame(width: size, height: size)
            .overlay(
                Text(message.initials)
                    .font(.system(size: fontSize, weight: .semibold))
                    .foregroundStyle(.white)
            )
    }
}
