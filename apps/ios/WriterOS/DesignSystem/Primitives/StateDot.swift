import SwiftUI

struct StateDot: View {
    let state: WriterState
    let size: CGFloat

    init(state: WriterState, size: CGFloat = 6) {
        self.state = state
        self.size = size
    }

    var body: some View {
        Circle()
            .fill(WriterColors.state(state))
            .frame(width: size, height: size)
    }
}
