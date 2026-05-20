import SwiftUI

struct DocumentWeatherCell: Identifiable, Equatable {
    let id: String
    let label: String
    let value: String
    let state: WriterState

    init(label: String, value: String, state: WriterState) {
        self.id = label
        self.label = label
        self.value = value
        self.state = state
    }
}

struct DocumentWeather: View {
    let cells: [DocumentWeatherCell]

    init(cells: [DocumentWeatherCell]) {
        self.cells = cells
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline(weight: .hairline)

            HStack(spacing: 0) {
                ForEach(cells) { cell in
                    VStack(alignment: .leading, spacing: 6) {
                        StateLabel(cell.label, state: cell.state)
                            .tracking(0.9)

                        Text(cell.value)
                            .font(WriterTypography.serif(size: 13))
                            .foregroundStyle(WriterColors.ink2)
                            .lineSpacing(2)
                    }
                    .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
                    .padding(.vertical, WriterSpacing.space2)
                    .padding(.horizontal, 6)
                    .overlay(alignment: .trailing) {
                        if cell.id != cells.last?.id {
                            Hairline(weight: .hairline, axis: .vertical)
                        }
                    }
                }
            }

            Hairline(weight: .hairline)
        }
    }
}
