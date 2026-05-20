import SwiftUI

struct WorkIndexItem: Identifiable, Equatable {
    let id: String
    let number: String
    let title: String
    let state: WriterState

    init(number: String, title: String, state: WriterState) {
        self.id = number
        self.number = number
        self.title = title
        self.state = state
    }
}

struct WorkIndex: View {
    let items: [WorkIndexItem]

    init(items: [WorkIndexItem]) {
        self.items = items
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline(weight: .ink)

            ForEach(items) { item in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(item.number)
                        .font(WriterTypography.metadata(size: 10))
                        .tracking(1)
                        .foregroundStyle(WriterColors.ink3)
                        .frame(width: 38, alignment: .leading)

                    Text(item.title)
                        .font(WriterTypography.supportingBody())
                        .foregroundStyle(WriterColors.ink2)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 0)

                    Text(item.state.label.uppercased())
                        .font(WriterTypography.metadata(size: 10))
                        .tracking(1)
                        .foregroundStyle(WriterColors.state(item.state))
                }
                .padding(.vertical, WriterSpacing.space3)
                .overlay(alignment: .bottom) {
                    Hairline(weight: .hairline)
                }
            }
        }
    }
}
