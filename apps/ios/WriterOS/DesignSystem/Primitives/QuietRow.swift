import SwiftUI

struct QuietRow: View {
    let state: WriterState
    let stateLabel: String
    let title: String
    let bodyText: String

    init(
        state: WriterState,
        stateLabel: String,
        title: String,
        body: String
    ) {
        self.state = state
        self.stateLabel = stateLabel
        self.title = title
        self.bodyText = body
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            StateDot(state)
                .padding(.top, 3)
                .offset(x: -17)

            VStack(alignment: .leading, spacing: WriterSpacing.space2) {
                StateLabel(stateLabel, state: state)

                VStack(alignment: .leading, spacing: WriterSpacing.space1) {
                    Text(title)
                        .font(WriterTypography.rowTitle)
                        .foregroundStyle(WriterColors.ink)
                        .lineSpacing(2.28)
                        .padding(.trailing, 46)

                    Text(bodyText)
                        .font(WriterTypography.supportingBody)
                        .foregroundStyle(WriterColors.ink2)
                        .lineSpacing(5.08)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 15)
        .overlay(alignment: .bottom) {
            Hairline(.hairline)
        }
    }
}
