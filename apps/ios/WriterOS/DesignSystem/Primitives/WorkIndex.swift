import SwiftUI

struct WorkIndexItem: Identifiable {
    let id: String
    let text: String
    let state: WriterState
    let mark: String
    /// Optional tap action. The index stays a reading order, never a task list —
    /// when set, the row only becomes a quiet navigation target (no checkbox,
    /// no chrome). Nil leaves the row non-interactive, matching DS-1 usage.
    let onSelect: (() -> Void)?

    init(
        id: String = UUID().uuidString,
        text: String,
        state: WriterState,
        mark: String,
        onSelect: (() -> Void)? = nil
    ) {
        self.id = id
        self.text = text
        self.state = state
        self.mark = mark
        self.onSelect = onSelect
    }
}

struct WorkIndex: View {
    let items: [WorkIndexItem]

    init(items: [WorkIndexItem]) {
        self.items = items
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline(.ink)

            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(String(format: "%02d", index + 1))
                        .font(WriterTypography.mono(size: 10, weight: .heavy))
                        .tracking(WriterTypography.tracking(em: 0.1, size: 10))
                        .foregroundStyle(WriterColors.ink3)
                        .frame(width: 38, alignment: .leading)

                    Text(item.text)
                        .font(WriterTypography.supportingBody)
                        .foregroundStyle(WriterColors.ink)
                        .lineSpacing(5.08)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: WriterSpacing.space2)

                    Text(item.mark.uppercased())
                        .font(WriterTypography.mono(size: 10, weight: .heavy))
                        .tracking(WriterTypography.tracking(em: 0.1, size: 10))
                        .foregroundStyle(item.state.color)
                }
                .padding(.vertical, WriterSpacing.space3)
                .overlay(alignment: .bottom) {
                    Hairline(.hairline)
                }
                .contentShape(Rectangle())
                .onTapGesture { item.onSelect?() }
            }
        }
    }
}
