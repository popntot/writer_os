import SwiftUI

struct SourceNote: View {
    let sourceLabel: String
    let state: WriterState
    let quote: String
    let context: String
    let isFirst: Bool

    init(sourceLabel: String, state: WriterState, quote: String, context: String, isFirst: Bool = false) {
        self.sourceLabel = sourceLabel
        self.state = state
        self.quote = quote
        self.context = context
        self.isFirst = isFirst
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space2) {
            StateLabel(sourceLabel, state: state)

            Text(quote)
                .font(WriterTypography.serif(size: 21))
                .lineSpacing(4)
                .foregroundStyle(WriterColors.ink)
                .fixedSize(horizontal: false, vertical: true)

            Text(context)
                .font(WriterTypography.serif(size: 13.5))
                .foregroundStyle(WriterColors.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 19)
        .overlay(alignment: .top) {
            Hairline(weight: isFirst ? .ink : .hairline)
        }
    }
}
