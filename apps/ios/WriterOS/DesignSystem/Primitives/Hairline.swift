import SwiftUI

struct Hairline: View {
    enum Axis {
        case horizontal
        case vertical
    }

    let weight: WriterRuleWeight
    let axis: Axis

    init(weight: WriterRuleWeight = .hairline, axis: Axis = .horizontal) {
        self.weight = weight
        self.axis = axis
    }

    var body: some View {
        Rectangle()
            .fill(weight.color)
            .frame(
                width: axis == .vertical ? weight.pixelWidth : nil,
                height: axis == .horizontal ? weight.pixelWidth : nil
            )
    }
}
