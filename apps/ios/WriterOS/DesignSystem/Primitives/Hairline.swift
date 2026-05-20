import SwiftUI

enum HairlineAxis {
    case horizontal
    case vertical
}

struct Hairline: View {
    let weight: RuleWeight
    let axis: HairlineAxis

    init(_ weight: RuleWeight = .hairline, axis: HairlineAxis = .horizontal) {
        self.weight = weight
        self.axis = axis
    }

    var body: some View {
        Rectangle()
            .fill(weight.color)
            .frame(
                maxWidth: axis == .horizontal ? .infinity : weight.thickness,
                maxHeight: axis == .vertical ? .infinity : weight.thickness,
            )
            .frame(
                width: axis == .vertical ? weight.thickness : nil,
                height: axis == .horizontal ? weight.thickness : nil,
            )
    }
}
