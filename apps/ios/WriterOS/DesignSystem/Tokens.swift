import SwiftUI
import UIKit

enum WriterState: String, CaseIterable, Identifiable {
    case active
    case ready
    case source
    case open
    case inactive

    var id: String {
        rawValue
    }

    var label: String {
        rawValue.capitalized
    }
}

enum WriterMode: String, CaseIterable, Identifiable {
    case walk
    case desk

    var id: String {
        rawValue
    }

    var label: String {
        rawValue.capitalized
    }
}

enum WriterRuleWeight {
    case ink
    case hairline
    case hairline2

    var color: Color {
        switch self {
        case .ink:
            return WriterColors.ink
        case .hairline:
            return WriterColors.hairline
        case .hairline2:
            return WriterColors.hairline2
        }
    }

    @MainActor var pixelWidth: CGFloat {
        1 / UIScreen.main.scale
    }
}

enum WriterColors {
    static let ground = Color(light: 0xfbfaf6, dark: 0x11110f)
    static let page = Color(light: 0xfffffb, dark: 0x191916)
    static let pageMuted = Color(light: 0xf4f1e8, dark: 0x202018)

    static let ink = Color(light: 0x171512, dark: 0xf3ecdc)
    static let ink2 = Color(light: 0x49443b, dark: 0xcfc4ac)
    static let ink3 = Color(light: 0x858072, dark: 0x8f856f)

    static let hairline = Color(light: 0xd9d3c5, dark: 0x454131)
    static let hairline2 = Color(light: 0xece7db, dark: 0x2d2b22)

    static let active = Color(light: 0x7d3b25, dark: 0xcc8063)
    static let ready = Color(light: 0x50684e, dark: 0xaab894)
    static let source = Color(light: 0x3c6672, dark: 0x9bbbc2)
    static let open = Color(light: 0x9a741c, dark: 0xd0ab4a)
    static let shadow = Color(light: 0x2a2216, dark: 0x000000, lightAlpha: 0.08, darkAlpha: 0.24)

    static func state(_ state: WriterState) -> Color {
        switch state {
        case .active:
            return active
        case .ready:
            return ready
        case .source:
            return source
        case .open:
            return open
        case .inactive:
            return ink3
        }
    }
}

enum WriterTypography {
    static let serifStack = [
        "IowanOldStyle-Roman",
        "Iowan Old Style",
        "Palatino-Roman",
        "Palatino Linotype",
        "Book Antiqua",
        "Georgia"
    ]

    static let monoStack = [
        "SFMono-Regular",
        "SF Mono",
        "IBMPlexMono-Regular",
        "JetBrainsMono-Regular",
        "Menlo-Regular",
        "Menlo"
    ]

    static func pageTitle() -> Font {
        serif(size: 48)
    }

    static func sectionHeading() -> Font {
        serif(size: 28)
    }

    static func rowTitle() -> Font {
        serif(size: 19)
    }

    static func primaryQuestion() -> Font {
        serif(size: 26)
    }

    static func body() -> Font {
        serif(size: 16)
    }

    static func supportingBody() -> Font {
        serif(size: 14.5)
    }

    static func metadata(size: CGFloat = 9, weight: Font.Weight = .heavy) -> Font {
        mono(size: size, weight: weight)
    }

    static func serif(size: CGFloat) -> Font {
        if let name = availableFontName(in: serifStack, size: size) {
            return .custom(name, fixedSize: size)
        }

        return .system(size: size, weight: .regular, design: .serif)
    }

    static func mono(size: CGFloat, weight: Font.Weight) -> Font {
        if let name = availableFontName(in: monoStack, size: size) {
            return .custom(name, fixedSize: size).weight(weight)
        }

        return .system(size: size, weight: weight, design: .monospaced)
    }

    private static func availableFontName(in stack: [String], size: CGFloat) -> String? {
        stack.first { UIFont(name: $0, size: size) != nil }
    }
}

enum WriterSpacing {
    static let space1: CGFloat = 5
    static let space2: CGFloat = 10
    static let space3: CGFloat = 16
    static let space3Tight: CGFloat = 15
    static let space4: CGFloat = 20
    static let space4Tight: CGFloat = 18
    static let space5: CGFloat = 28
    static let space5Tight: CGFloat = 26
    static let space6: CGFloat = 38
    static let space6Tight: CGFloat = 32
    static let space7: CGFloat = 44

    static let leftRail: CGFloat = 70
    static let railRuleX: CGFloat = 54
    static let rightPadding: CGFloat = 26
    static let topPadding: CGFloat = 20
    static let bottomPadding: CGFloat = 26
    static let contentMeasure: CGFloat = 290
    static let bottomNavHeight: CGFloat = 72
    static let topChromeHeight: CGFloat = 42
    static let modeSwitchHeight: CGFloat = 42
}

enum WriterMotion {
    @MainActor static var reducedMotionEnabled: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    @MainActor static var settleAnimation: Animation? {
        reducedMotionEnabled ? nil : .easeOut(duration: 0.22)
    }

    @MainActor static var settleOffset: CGFloat {
        reducedMotionEnabled ? 0 : 8
    }
}

extension Color {
    init(light: UInt32, dark: UInt32, lightAlpha: CGFloat = 1, darkAlpha: CGFloat = 1) {
        self.init(UIColor { traitCollection in
            if traitCollection.userInterfaceStyle == .dark {
                return UIColor(hex: dark, alpha: darkAlpha)
            }

            return UIColor(hex: light, alpha: lightAlpha)
        })
    }
}

private extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        let red = CGFloat((hex & 0xff0000) >> 16) / 255
        let green = CGFloat((hex & 0x00ff00) >> 8) / 255
        let blue = CGFloat(hex & 0x0000ff) / 255

        self.init(red: red, green: green, blue: blue, alpha: alpha)
    }
}

extension View {
    func writerSettlingFade() -> some View {
        modifier(WriterSettlingFadeModifier())
    }
}

private struct WriterSettlingFadeModifier: ViewModifier {
    @State private var settled = false

    func body(content: Content) -> some View {
        content
            .opacity(settled ? 1 : 0)
            .offset(y: settled ? 0 : WriterMotion.settleOffset)
            .animation(WriterMotion.settleAnimation, value: settled)
            .onAppear {
                settled = true
            }
    }
}
