import SwiftUI

struct PageRail: View {
    let pageMark: String?

    init(pageMark: String? = nil) {
        self.pageMark = pageMark
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Hairline(.hairline2, axis: .vertical)
                .offset(x: WriterSpacing.railRuleX)

            if let pageMark {
                Text(pageMark.uppercased())
                    .font(WriterTypography.mono(size: 9, weight: .bold))
                    .tracking(WriterTypography.tracking(em: 0.15, size: 9))
                    .foregroundStyle(WriterColors.ink3)
                    .lineLimit(1)
                    .fixedSize()
                    .rotationEffect(.degrees(90), anchor: .topLeading)
                    .offset(x: 22, y: 34)
            }
        }
        .frame(width: WriterSpacing.leftRail, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .topLeading)
    }
}
