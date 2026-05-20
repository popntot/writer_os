import SwiftUI

struct PageShell<Content: View, BottomNavContent: View>: View {
    private let pageMark: String?
    private let content: Content
    private let bottomNav: BottomNavContent

    init(
        pageMark: String? = nil,
        @ViewBuilder content: () -> Content,
        @ViewBuilder bottomNav: () -> BottomNavContent
    ) {
        self.pageMark = pageMark
        self.content = content()
        self.bottomNav = bottomNav()
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            WriterColors.page
                .ignoresSafeArea()

            PageRail(pageMark: pageMark)

            content
                .frame(maxWidth: WriterSpacing.measure, alignment: .topLeading)
                .padding(.top, WriterSpacing.topPadding)
                .padding(.trailing, WriterSpacing.rightPadding)
                .padding(.bottom, WriterSpacing.bottomPadding)
                .padding(.leading, WriterSpacing.leftRail)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .assertSinglePrimaryQuestion()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomNav
        }
        .background(WriterColors.ground.ignoresSafeArea())
    }
}

extension PageShell where BottomNavContent == EmptyView {
    init(pageMark: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(pageMark: pageMark, content: content) {
            EmptyView()
        }
    }
}
