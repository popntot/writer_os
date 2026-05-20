import SwiftUI

struct DocumentWeatherCell: Identifiable {
    let id: String
    let label: String
    let value: String
    let state: WriterState?

    init(
        id: String = UUID().uuidString,
        label: String,
        value: String,
        state: WriterState? = nil
    ) {
        self.id = id
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
            Hairline(.hairline)

            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(cells.enumerated()), id: \.element.id) { index, cell in
                    weatherCell(cell)

                    if index < cells.count - 1 {
                        Hairline(.hairline, axis: .vertical)
                    }
                }
            }
            .frame(minHeight: 58)

            Hairline(.hairline)
        }
    }

    private func weatherCell(_ cell: DocumentWeatherCell) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            StateLabel(cell.label, state: cell.state)

            Text(cell.value)
                .font(WriterTypography.serif(size: 13))
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(2.6)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, WriterSpacing.space2)
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
    }
}
