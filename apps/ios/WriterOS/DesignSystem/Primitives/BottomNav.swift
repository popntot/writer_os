import SwiftUI

struct BottomNav: View {
    let tabs: [String]
    let activeTab: String
    let onSelect: (String) -> Void

    init(
        tabs: [String],
        activeTab: String,
        onSelect: @escaping (String) -> Void
    ) {
        precondition(tabs.count <= 6, "BottomNav supports six tabs maximum.")
        self.tabs = tabs
        self.activeTab = activeTab
        self.onSelect = onSelect
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline(.hairline)

            HStack(spacing: 0) {
                ForEach(Array(tabs.enumerated()), id: \.offset) { index, tab in
                    Button {
                        onSelect(tab)
                    } label: {
                        Text(tab.uppercased())
                            .font(WriterTypography.metadata)
                            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                            .foregroundStyle(tab == activeTab ? WriterColors.ink : WriterColors.ink3)
                            .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)
                            .background(tab == activeTab ? WriterColors.pageMuted : Color.clear)
                    }
                    .buttonStyle(.plain)

                    if index < tabs.count - 1 {
                        Hairline(.hairline2, axis: .vertical)
                    }
                }
            }
        }
        .frame(minHeight: WriterSpacing.bottomNavHeight)
        .background(WriterColors.page.opacity(0.92))
    }
}
