import SwiftUI

struct PrimaryQuestion: View {
    let question: String

    init(_ question: String) {
        self.question = question
    }

    var body: some View {
        Text(question)
            .font(WriterTypography.primaryQuestion())
            .lineSpacing(4)
            .foregroundStyle(WriterColors.ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, WriterSpacing.space5Tight)
            .padding(.bottom, WriterSpacing.space5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) {
                Hairline(weight: .ink)
            }
            .overlay(alignment: .bottom) {
                Hairline(weight: .ink)
            }
    }
}
