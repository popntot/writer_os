import SwiftUI

struct PrimaryQuestion: View {
    let question: String

    init(_ question: String) {
        self.question = question
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline(.ink)

            Text(question)
                .font(WriterTypography.primaryQuestion)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(4.42)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 26)
                .padding(.bottom, 28)
                .frame(maxWidth: .infinity, alignment: .leading)

            Hairline(.ink)
        }
        .primaryQuestionInstance()
    }
}
