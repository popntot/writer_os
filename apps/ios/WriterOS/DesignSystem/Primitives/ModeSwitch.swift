import SwiftUI

struct ModeSwitch: View {
    @Binding private var selection: WriterMode

    init(selection: Binding<WriterMode>) {
        self._selection = selection
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(WriterMode.allCases) { mode in
                Button {
                    selection = mode
                } label: {
                    Text(mode.label.uppercased())
                        .font(WriterTypography.metadata(size: 9))
                        .fontWeight(.heavy)
                        .tracking(1.08)
                        .foregroundStyle(selection == mode ? WriterColors.ink : WriterColors.ink3)
                        .frame(maxWidth: .infinity, minHeight: WriterSpacing.modeSwitchHeight)
                        .background(selection == mode ? WriterColors.pageMuted : Color.clear)
                }
                .buttonStyle(.plain)
                .overlay(alignment: .trailing) {
                    if mode != WriterMode.allCases.last {
                        Hairline(weight: .hairline, axis: .vertical)
                    }
                }
            }
        }
        .overlay(alignment: .top) {
            Hairline(weight: .hairline)
        }
        .overlay(alignment: .bottom) {
            Hairline(weight: .hairline)
        }
    }
}
