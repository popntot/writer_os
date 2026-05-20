import SwiftUI
import UIKit

enum WriterColors {
    static var ground: Color { dynamic(light: 0xfbfaf6, night: 0x11110f) }
    static var page: Color { dynamic(light: 0xfffffb, night: 0x191916) }
    static var pageMuted: Color { dynamic(light: 0xf4f1e8, night: 0x202018) }

    static var ink: Color { dynamic(light: 0x171512, night: 0xf3ecdc) }
    static var ink2: Color { dynamic(light: 0x49443b, night: 0xcfc4ac) }
    static var ink3: Color { dynamic(light: 0x858072, night: 0x8f856f) }

    static var hairline: Color { dynamic(light: 0xd9d3c5, night: 0x454131) }
    static var hairline2: Color { dynamic(light: 0xece7db, night: 0x2d2b22) }

    static var active: Color { dynamic(light: 0x7d3b25, night: 0xcc8063) }
    static var ready: Color { dynamic(light: 0x50684e, night: 0xaab894) }
    static var source: Color { dynamic(light: 0x3c6672, night: 0x9bbbc2) }
    static var open: Color { dynamic(light: 0x9a741c, night: 0xd0ab4a) }

    static var shadow: Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0, green: 0, blue: 0, alpha: 0.24)
                : UIColor(red: 42 / 255, green: 34 / 255, blue: 22 / 255, alpha: 0.08)
        })
    }

    private static func dynamic(light: UInt32, night: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            uiColor(hex: traits.userInterfaceStyle == .dark ? night : light)
        })
    }

    private static func uiColor(hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: 1,
        )
    }
}

enum WriterTypography {
    static func serif(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("Iowan Old Style", size: size).weight(weight)
    }

    static func mono(size: CGFloat, weight: Font.Weight = .heavy) -> Font {
        .custom("SF Mono", size: size).weight(weight)
    }

    static var pageTitle: Font { serif(size: 46, weight: .medium) }
    static var sectionHeading: Font { serif(size: 28, weight: .medium) }
    static var rowTitle: Font { serif(size: 19, weight: .medium) }
    static var primaryQuestion: Font { serif(size: 26, weight: .regular) }
    static var body: Font { serif(size: 16, weight: .regular) }
    static var supportingBody: Font { serif(size: 14.5, weight: .regular) }
    static var metadata: Font { mono(size: 9, weight: .heavy) }

    static func tracking(em: CGFloat, size: CGFloat) -> CGFloat {
        em * size
    }
}

enum WriterSpacing {
    static let space1: CGFloat = 5
    static let space2: CGFloat = 10
    static let space3: CGFloat = 16
    static let space4: CGFloat = 20
    static let space5: CGFloat = 28
    static let space6: CGFloat = 38
    static let space7: CGFloat = 44

    static let leftRail: CGFloat = 70
    static let railRuleX: CGFloat = 54
    static let rightPadding: CGFloat = 26
    static let topPadding: CGFloat = 20
    static let bottomPadding: CGFloat = 26
    static let measure: CGFloat = 290
    static let bottomNavHeight: CGFloat = 72
    static let topChrome: CGFloat = 42
}

enum RuleWeight: CaseIterable {
    case ink
    case hairline
    case hairline2

    var color: Color {
        switch self {
        case .ink:
            WriterColors.ink
        case .hairline:
            WriterColors.hairline
        case .hairline2:
            WriterColors.hairline2
        }
    }

    var thickness: CGFloat {
        1
    }
}

enum WriterState: String, CaseIterable, Identifiable {
    case active
    case ready
    case source
    case open
    case inactive

    var id: String { rawValue }

    var label: String {
        rawValue.capitalized
    }

    var color: Color {
        switch self {
        case .active:
            WriterColors.active
        case .ready:
            WriterColors.ready
        case .source:
            WriterColors.source
        case .open:
            WriterColors.open
        case .inactive:
            WriterColors.ink3
        }
    }
}

enum WriterMode: String, CaseIterable, Identifiable {
    case walk
    case desk

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

struct WriterFade: ViewModifier {
    let isVisible: Bool

    func body(content: Content) -> some View {
        let reduceMotion = UIAccessibility.isReduceMotionEnabled

        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: reduceMotion || isVisible ? 0 : 8)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: isVisible)
    }
}

extension View {
    func writerFade(isVisible: Bool = true) -> some View {
        modifier(WriterFade(isVisible: isVisible))
    }

    func primaryQuestionInstance() -> some View {
        modifier(PrimaryQuestionInstanceModifier())
    }

    func assertSinglePrimaryQuestion() -> some View {
        onPreferenceChange(PrimaryQuestionCountKey.self) { count in
            assert(count <= 1, "A Writer OS screen may render only one PrimaryQuestion.")
        }
    }
}

private struct PrimaryQuestionCountKey: PreferenceKey {
    static var defaultValue: Int { 0 }

    static func reduce(value: inout Int, nextValue: () -> Int) {
        value += nextValue()
    }
}

private struct PrimaryQuestionInstanceModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.preference(key: PrimaryQuestionCountKey.self, value: 1)
    }
}
