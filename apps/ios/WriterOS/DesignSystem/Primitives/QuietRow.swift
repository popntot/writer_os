import SwiftUI

struct QuietRow: View {
    let state: WriterState
    let label: String
    let title: String
    let bodyText: String

    init(state: WriterState, label: String, title: String, body: String) {
        self.state = state
        self.label = label
        self.title = title
        self.bodyText = body
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            StateDot(state: state)
                .offset(x: -17, y: 3)

            VStack(alignment: .leading, spacing: WriterSpacing.space2) {
                StateLabel(label, state: state)

                Text(title)
                    .font(WriterTypography.rowTitle())
                    .fontWeight(.medium)
                    .lineSpacing(2)
                    .foregroundStyle(WriterColors.ink)
                    .padding(.trailing, 46)

                Text(bodyText)
                    .font(WriterTypography.supportingBody())
                    .lineSpacing(5)
                    .foregroundStyle(WriterColors.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, WriterSpacing.space3Tight)
        .overlay(alignment: .bottom) {
            Hairline(weight: .hairline)
        }
    }
}
