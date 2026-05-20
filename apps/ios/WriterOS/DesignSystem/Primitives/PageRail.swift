import SwiftUI

struct PageRail: View {
    let mark: String?

    init(mark: String? = nil) {
        self.mark = mark
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Hairline(weight: .hairline2, axis: .vertical)
                .padding(.leading, WriterSpacing.railRuleX)

            if let mark {
                Text(mark.uppercased())
                    .font(WriterTypography.metadata(size: 9))
                    .tracking(1.35)
                    .foregroundStyle(WriterColors.ink3)
                    .rotationEffect(.degrees(-90), anchor: .topLeading)
                    .fixedSize()
                    .padding(.top, 150)
                    .padding(.leading, 19)
            }
        }
        .frame(width: WriterSpacing.leftRail, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}
