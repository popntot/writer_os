import SwiftUI

struct ModeSwitch: View {
    let selectedMode: WriterMode
    let onSelect: (WriterMode) -> Void

    init(
        selectedMode: WriterMode,
        onSelect: @escaping (WriterMode) -> Void
    ) {
        self.selectedMode = selectedMode
        self.onSelect = onSelect
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline(.hairline)

            HStack(spacing: 0) {
                ForEach(Array(WriterMode.allCases.enumerated()), id: \.element.id) { index, mode in
                    Button {
                        onSelect(mode)
                    } label: {
                        Text(mode.label.uppercased())
                            .font(WriterTypography.metadata)
                            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                            .foregroundStyle(mode == selectedMode ? WriterColors.ink : WriterColors.ink3)
                            .frame(maxWidth: .infinity, minHeight: 42)
                            .background(mode == selectedMode ? WriterColors.pageMuted : Color.clear)
                    }
                    .buttonStyle(.plain)

                    if index < WriterMode.allCases.count - 1 {
                        Hairline(.hairline, axis: .vertical)
                    }
                }
            }

            Hairline(.hairline)
        }
        .frame(minHeight: 42)
    }
}
