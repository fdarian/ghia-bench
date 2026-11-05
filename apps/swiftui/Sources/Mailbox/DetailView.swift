import SwiftUI

struct DetailView: View {
    let model: MailboxModel
    private static let top = "detail-top"

    var body: some View {
        Group {
            if let message = model.selected {
                ScrollViewReader { proxy in
                    ScrollView {
                        MessageDetail(message: message)
                            .id(Self.top)
                    }
                    .onChange(of: model.detailGeneration) {
                        proxy.scrollTo(Self.top, anchor: .top)
                    }
                }
            } else {
                Text("No message selected")
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.faint)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color.white)
    }
}

private struct MessageDetail: View {
    let message: Message

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(message.subject)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .lineHeight(28, size: 22, weight: .semibold)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .top, spacing: 12) {
                Avatar(message: message, size: 40, fontSize: 15)
                VStack(alignment: .leading, spacing: 0) {
                    Text(message.fromName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
                        .frame(height: 20)
                    Text(message.fromEmail)
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .frame(height: 20)
                }
                .frame(height: 40)
                Spacer(minLength: 12)
                Text(message.dateLong)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                    .frame(height: 16)
            }
            .frame(height: 40)
            .padding(.top, 16)

            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(message.body.enumerated()), id: \.offset) { _, paragraph in
                    Text(paragraph)
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.inkStrong)
                        .lineHeight(22, size: 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 24)
        }
        .padding(32)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}
