import SwiftUI

struct SourceNote: View {
    let sourceLabel: String
    let quote: String
    let context: String

    init(sourceLabel: String, quote: String, context: String) {
        self.sourceLabel = sourceLabel
        self.quote = quote
        self.context = context
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Hairline(.hairline)

            VStack(alignment: .leading, spacing: 9) {
                StateLabel(sourceLabel, state: .source)

                Text(quote)
                    .font(WriterTypography.serif(size: 21))
                    .foregroundStyle(WriterColors.ink)
                    .lineSpacing(5.04)
                    .fixedSize(horizontal: false, vertical: true)

                Text(context)
                    .font(WriterTypography.serif(size: 13.5))
                    .foregroundStyle(WriterColors.ink2)
                    .lineSpacing(4.73)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 19)
        }
    }
}
