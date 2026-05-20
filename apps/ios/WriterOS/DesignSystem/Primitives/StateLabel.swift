import SwiftUI

struct StateLabel: View {
    let text: String
    let state: WriterState

    init(_ text: String, state: WriterState) {
        self.text = text
        self.state = state
    }

    var body: some View {
        Text(text.uppercased())
            .font(WriterTypography.metadata(size: 9))
            .fontWeight(.heavy)
            .tracking(1.08)
            .foregroundStyle(WriterColors.state(state))
            .lineLimit(nil)
    }
}
