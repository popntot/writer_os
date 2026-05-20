import SwiftUI

struct StateDot: View {
    let state: WriterState

    init(_ state: WriterState) {
        self.state = state
    }

    var body: some View {
        Circle()
            .fill(state.color)
            .frame(width: 6, height: 6)
    }
}
