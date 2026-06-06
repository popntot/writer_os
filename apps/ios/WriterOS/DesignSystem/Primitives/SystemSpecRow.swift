import SwiftUI

struct SystemSpecRow<Accessory: View>: View {
    let label: String
    let title: String
    let bodyText: String
    let value: String?
    private let accessory: Accessory

    init(
        label: String,
        title: String,
        body: String,
        value: String? = nil,
        @ViewBuilder accessory: () -> Accessory
    ) {
        self.label = label
        self.title = title
        self.bodyText = body
        self.value = value
        self.accessory = accessory()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space2) {
            StateLabel(label)

            HStack(alignment: .top, spacing: WriterSpacing.space3) {
                VStack(alignment: .leading, spacing: WriterSpacing.space1) {
                    Text(title)
                        .font(WriterTypography.rowTitle)
                        .foregroundStyle(WriterColors.ink)
                        .lineSpacing(2.28)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(bodyText)
                        .font(WriterTypography.supportingBody)
                        .foregroundStyle(WriterColors.ink2)
                        .lineSpacing(5.08)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: WriterSpacing.space2) {
                    if let value {
                        Text(value)
                            .font(WriterTypography.mono(size: 10, weight: .heavy))
                            .tracking(WriterTypography.tracking(em: 0.1, size: 10))
                            .foregroundStyle(WriterColors.ink)
                            .lineLimit(1)
                    }

                    accessory
                }
            }
        }
        .padding(.vertical, WriterSpacing.space3)
        .overlay(alignment: .bottom) {
            Hairline(.hairline)
        }
    }
}

extension SystemSpecRow where Accessory == EmptyView {
    init(
        label: String,
        title: String,
        body: String,
        value: String? = nil
    ) {
        self.init(label: label, title: title, body: body, value: value) {
            EmptyView()
        }
    }
}
