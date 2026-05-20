import SwiftUI

struct BottomNav: View {
    static let canonicalTabs = ["Today", "Walk", "Close", "Article", "Source", "System"]

    let tabs: [String]
    let activeTab: String
    let onSelect: (String) -> Void

    init(
        tabs: [String] = BottomNav.canonicalTabs,
        activeTab: String,
        onSelect: @escaping (String) -> Void = { _ in }
    ) {
        self.tabs = Array(tabs.prefix(6))
        self.activeTab = activeTab
        self.onSelect = onSelect
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs, id: \.self) { tab in
                Button {
                    onSelect(tab)
                } label: {
                    Text(tab.uppercased())
                        .font(WriterTypography.metadata(size: 9))
                        .fontWeight(.heavy)
                        .tracking(1.08)
                        .foregroundStyle(tab == activeTab ? WriterColors.ink : WriterColors.ink3)
                        .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)
                        .background(tab == activeTab ? WriterColors.pageMuted : Color.clear)
                }
                .buttonStyle(.plain)
                .overlay(alignment: .trailing) {
                    if tab != tabs.last {
                        Hairline(weight: .hairline2, axis: .vertical)
                    }
                }
            }
        }
        .frame(minHeight: WriterSpacing.bottomNavHeight)
        .background(WriterColors.page.opacity(0.92))
        .overlay(alignment: .top) {
            Hairline(weight: .hairline)
        }
    }
}
