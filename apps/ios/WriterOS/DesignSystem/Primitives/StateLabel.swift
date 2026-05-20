import SwiftUI

struct StateLabel: View {
    let text: String
    let state: WriterState?

    init(_ text: String, state: WriterState? = nil) {
        self.text = text
        self.state = state
    }

    var body: some View {
        Text(text.uppercased())
            .font(WriterTypography.metadata)
            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
            .foregroundStyle(state?.color ?? WriterColors.ink3)
            .textCase(.uppercase)
            .lineLimit(nil)
    }
}
