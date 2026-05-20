import SwiftUI
import UIKit
import XCTest
@testable import WriterOS

@MainActor
final class DesignSystemSnapshotTests: XCTestCase {
    private let snapshotSize = CGSize(width: 390, height: 360)

    func testPageShellSnapshots() throws {
        try assertSnapshots(
            named: "page-shell",
            size: CGSize(width: 390, height: 844),
            view: PageShell(pageMark: "Today") {
                VStack(alignment: .leading, spacing: WriterSpacing.space4) {
                    StateLabel("Active", state: .active)
                    Text("Walk")
                        .font(WriterTypography.pageTitle)
                        .foregroundStyle(WriterColors.ink)
                    Text("The page shell owns the rail, measure, and bottom inset.")
                        .font(WriterTypography.body)
                        .foregroundStyle(WriterColors.ink2)
                }
            } bottomNav: {
                BottomNav(
                    tabs: ["Today", "Walk", "Close", "Article", "Source", "System"],
                    activeTab: "Today",
                    onSelect: { _ in },
                )
            },
        )
    }

    func testPageRailSnapshots() throws {
        try assertSnapshots(
            named: "page-rail",
            view: PageRail(pageMark: "Source")
                .background(WriterColors.page),
        )
    }

    func testHairlineSnapshots() throws {
        try assertSnapshots(
            named: "hairline",
            view: VStack(spacing: WriterSpacing.space6) {
                Hairline(.ink)
                Hairline(.hairline)
                Hairline(.hairline2)
            }
            .padding(.horizontal, WriterSpacing.leftRail)
            .background(WriterColors.page),
        )
    }

    func testStateDotSnapshots() throws {
        try assertSnapshots(
            named: "state-dot",
            view: HStack(spacing: WriterSpacing.space4) {
                ForEach(WriterState.allCases) { state in
                    StateDot(state)
                }
            }
            .padding(WriterSpacing.space6)
            .background(WriterColors.page),
        )
    }

    func testStateLabelSnapshots() throws {
        try assertSnapshots(
            named: "state-label",
            view: VStack(alignment: .leading, spacing: WriterSpacing.space2) {
                ForEach(WriterState.allCases) { state in
                    StateLabel(state.label, state: state)
                }
            }
            .padding(WriterSpacing.space6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(WriterColors.page),
        )
    }

    func testQuietRowSnapshots() throws {
        try assertSnapshots(
            named: "quiet-row",
            view: QuietRow(
                state: .open,
                stateLabel: "Open",
                title: "Preference layer unresolved",
                body: "Keep the walk pointed at the difference between taste and craft.",
            )
            .padding(.leading, 24)
            .padding(.horizontal, WriterSpacing.space5)
            .background(WriterColors.page),
        )
    }

    func testPrimaryQuestionSnapshots() throws {
        try assertSnapshots(
            named: "primary-question",
            view: PrimaryQuestion("What pressure belongs in the essay, and what belongs in the walk?")
                .padding(WriterSpacing.space5)
                .background(WriterColors.page),
        )
    }

    func testWorkIndexSnapshots() throws {
        try assertSnapshots(
            named: "work-index",
            view: WorkIndex(
                items: [
                    WorkIndexItem(id: "one", text: "Name the central pressure.", state: .active, mark: "Act"),
                    WorkIndexItem(id: "two", text: "Pull source notes into reading order.", state: .source, mark: "Src"),
                    WorkIndexItem(id: "three", text: "Leave the unresolved question visible.", state: .open, mark: "Open"),
                ],
            )
            .padding(WriterSpacing.space5)
            .background(WriterColors.page),
        )
    }

    func testDocumentWeatherSnapshots() throws {
        try assertSnapshots(
            named: "document-weather",
            view: DocumentWeather(
                cells: [
                    DocumentWeatherCell(id: "draft", label: "Draft", value: "Open", state: .open),
                    DocumentWeatherCell(id: "voice", label: "Voice", value: "Close", state: .ready),
                    DocumentWeatherCell(id: "lineage", label: "Lineage", value: "Sourced", state: .source),
                    DocumentWeatherCell(id: "risk", label: "Risk", value: "Live", state: .active),
                ],
            )
            .padding(WriterSpacing.space5)
            .background(WriterColors.page),
        )
    }

    func testSourceNoteSnapshots() throws {
        try assertSnapshots(
            named: "source-note",
            view: SourceNote(
                sourceLabel: "SRC 01",
                quote: "A serious writing instrument should make the next sentence easier to see.",
                context: "This anchors the source surface to cited marginalia.",
            )
            .padding(WriterSpacing.space5)
            .background(WriterColors.page),
        )
    }

    func testBottomNavSnapshots() throws {
        try assertSnapshots(
            named: "bottom-nav",
            view: BottomNav(
                tabs: ["Today", "Walk", "Close", "Article", "Source", "System"],
                activeTab: "Source",
                onSelect: { _ in },
            )
            .background(WriterColors.page),
        )
    }

    func testModeSwitchSnapshots() throws {
        try assertSnapshots(
            named: "mode-switch",
            view: ModeSwitch(selectedMode: .walk, onSelect: { _ in })
                .padding(WriterSpacing.space5)
                .background(WriterColors.page),
        )
    }

    private func assertSnapshots<V: View>(
        named name: String,
        size: CGSize? = nil,
        view: V,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        for tone in SnapshotTone.allCases {
            let image = render(view: view, size: size ?? snapshotSize, style: tone.style)
            let pngData = try XCTUnwrap(image.pngData(), file: file, line: line)
            let snapshotURL = snapshotURL(named: "\(name)-\(tone.rawValue)", file: file)

            if FileManager.default.fileExists(atPath: snapshotURL.path) {
                let expected = try Data(contentsOf: snapshotURL)
                if pngData != expected {
                    let failureURL = failureURL(named: "\(name)-\(tone.rawValue)", file: file)
                    try FileManager.default.createDirectory(
                        at: failureURL.deletingLastPathComponent(),
                        withIntermediateDirectories: true,
                    )
                    try pngData.write(to: failureURL)
                    XCTFail(
                        "Snapshot mismatch for \(name) \(tone.rawValue). Wrote failure to \(failureURL.path)",
                        file: file,
                        line: line,
                    )
                }
            } else {
                try FileManager.default.createDirectory(
                    at: snapshotURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true,
                )
                try pngData.write(to: snapshotURL)
                XCTFail("Recorded missing snapshot at \(snapshotURL.path)", file: file, line: line)
            }
        }
    }

    private func render<V: View>(
        view: V,
        size: CGSize,
        style: UIUserInterfaceStyle
    ) -> UIImage {
        let controller = UIHostingController(
            rootView: view
                .frame(width: size.width, height: size.height)
                .environment(\.dynamicTypeSize, .medium),
        )
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.overrideUserInterfaceStyle = style
        window.rootViewController = controller
        window.isHidden = false

        controller.view.bounds = window.bounds
        controller.view.backgroundColor = .clear
        controller.view.setNeedsLayout()
        controller.view.layoutIfNeeded()

        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = true

        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            controller.view.drawHierarchy(in: controller.view.bounds, afterScreenUpdates: true)
        }
    }

    private func snapshotURL(named name: String, file: StaticString) -> URL {
        URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent()
            .appendingPathComponent("__Snapshots__")
            .appendingPathComponent("\(name).png")
    }

    private func failureURL(named name: String, file: StaticString) -> URL {
        URL(fileURLWithPath: "\(file)")
            .deletingLastPathComponent()
            .appendingPathComponent("__Snapshots__")
            .appendingPathComponent("__Failures__")
            .appendingPathComponent("\(name).png")
    }
}

private enum SnapshotTone: String, CaseIterable {
    case light
    case night

    var style: UIUserInterfaceStyle {
        switch self {
        case .light:
            .light
        case .night:
            .dark
        }
    }
}
