import SwiftUI

struct PageShell<Content: View, Footer: View>: View {
    private let pageMark: String?
    private let content: Content
    private let footer: Footer

    init(
        pageMark: String? = nil,
        @ViewBuilder footer: () -> Footer,
        @ViewBuilder content: () -> Content
    ) {
        self.pageMark = pageMark
        self.footer = footer()
        self.content = content()
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            WriterColors.page
                .ignoresSafeArea()

            PageRail(mark: pageMark)

            ScrollView(showsIndicators: false) {
                content
                    .frame(maxWidth: WriterSpacing.contentMeasure, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, WriterSpacing.topPadding)
                    .padding(.trailing, WriterSpacing.rightPadding)
                    .padding(.bottom, WriterSpacing.bottomPadding)
                    .padding(.leading, WriterSpacing.leftRail)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer
        }
    }
}

extension PageShell where Footer == EmptyView {
    init(pageMark: String? = nil, @ViewBuilder content: () -> Content) {
        self.pageMark = pageMark
        self.footer = EmptyView()
        self.content = content()
    }
}
