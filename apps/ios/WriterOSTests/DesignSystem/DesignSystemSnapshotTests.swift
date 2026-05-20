import SwiftUI
import UIKit
import XCTest
@testable import WriterOS

@MainActor
final class DesignSystemSnapshotTests: XCTestCase {
    func testPageShellSnapshot() {
        assertSnapshots(named: "PageShell") {
            PageShell(pageMark: "Today / Walk 3") {
                StateLabel("Today", state: .inactive)
                PrimaryQuestion("If effort no longer buys dignity, what does a Tuesday ask for?")
            }
        }
    }

    func testPageRailSnapshot() {
        assertSnapshots(named: "PageRail", height: 520) {
            PageRail(mark: "Today / Walk 3")
                .background(WriterColors.page)
        }
    }

    func testHairlineSnapshot() {
        assertSnapshots(named: "Hairline", height: 120) {
            VStack(spacing: 24) {
                Hairline(weight: .ink)
                Hairline(weight: .hairline)
                Hairline(weight: .hairline2)
            }
            .padding(24)
            .background(WriterColors.page)
        }
    }

    func testStateDotSnapshot() {
        assertSnapshots(named: "StateDot", height: 120) {
            HStack(spacing: 18) {
                ForEach(WriterState.allCases) { state in
                    StateDot(state: state)
                }
            }
            .padding(24)
            .background(WriterColors.page)
        }
    }

    func testStateLabelSnapshot() {
        assertSnapshots(named: "StateLabel", height: 160) {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(WriterState.allCases) { state in
                    StateLabel(state.label, state: state)
                }
            }
            .padding(24)
            .background(WriterColors.page)
        }
    }

    func testQuietRowSnapshot() {
        assertSnapshots(named: "QuietRow", height: 220) {
            VStack(spacing: 0) {
                QuietRow(
                    state: .active,
                    label: "Active",
                    title: "Article 1 needs a cold read",
                    body: "The opener is not ready for revision until it has been read slowly."
                )
                QuietRow(
                    state: .open,
                    label: "Open",
                    title: "Work after coercion",
                    body: "Stay with the felt life before reaching for architecture."
                )
            }
            .padding(.leading, 28)
            .padding(.trailing, 16)
            .background(WriterColors.page)
        }
    }

    func testPrimaryQuestionSnapshot() {
        assertSnapshots(named: "PrimaryQuestion", height: 220) {
            PrimaryQuestion("If money no longer assigns dignity, what does effort feel like on a Tuesday?")
                .padding(24)
                .background(WriterColors.page)
        }
    }

    func testWorkIndexSnapshot() {
        assertSnapshots(named: "WorkIndex", height: 240) {
            WorkIndex(items: [
                WorkIndexItem(number: "01", title: "Read Article 1 draft 2 without editing it.", state: .active),
                WorkIndexItem(number: "02", title: "Review lineage candidates for Article 0.", state: .source),
                WorkIndexItem(number: "03", title: "Desk-test starter packs, not manifesto.", state: .open)
            ])
            .padding(24)
            .background(WriterColors.page)
        }
    }

    func testDocumentWeatherSnapshot() {
        assertSnapshots(named: "DocumentWeather", height: 170) {
            DocumentWeather(cells: [
                DocumentWeatherCell(label: "Draft", value: "Not yet", state: .active),
                DocumentWeatherCell(label: "Voice", value: "Letter", state: .ready),
                DocumentWeatherCell(label: "Lineage", value: "Warm", state: .source),
                DocumentWeatherCell(label: "Risk", value: "Overclaim", state: .open)
            ])
            .padding(24)
            .background(WriterColors.page)
        }
    }

    func testSourceNoteSnapshot() {
        assertSnapshots(named: "SourceNote", height: 220) {
            SourceNote(
                sourceLabel: "SRC 01",
                state: .source,
                quote: "Starter packs, not manifesto.",
                context: "Promising, late-walk, still needs desk testing.",
                isFirst: true
            )
            .padding(24)
            .background(WriterColors.page)
        }
    }

    func testBottomNavSnapshot() {
        assertSnapshots(named: "BottomNav", height: 130) {
            VStack {
                Spacer()
                BottomNav(activeTab: "Today")
            }
            .background(WriterColors.page)
        }
    }

    func testModeSwitchSnapshot() {
        assertSnapshots(named: "ModeSwitch", height: 130) {
            ModeSwitch(selection: .constant(.walk))
                .padding(24)
                .background(WriterColors.page)
        }
    }

    private func assertSnapshots<V: View>(
        named name: String,
        width: CGFloat = 390,
        height: CGFloat = 700,
        @ViewBuilder view: () -> V,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let light = render(view(), width: width, height: height, style: .light)
        let night = render(view(), width: width, height: height, style: .dark)

        attach(light, named: "\(name)-light")
        attach(night, named: "\(name)-night")

        guard let lightData = light.pngData(), let nightData = night.pngData() else {
            XCTFail("Expected PNG snapshot data for \(name).", file: file, line: line)
            return
        }

        XCTAssertGreaterThan(lightData.count, 0, file: file, line: line)
        XCTAssertGreaterThan(nightData.count, 0, file: file, line: line)
        XCTAssertNotEqual(lightData, nightData, "Light and night snapshots should differ.", file: file, line: line)
    }

    private func render<V: View>(
        _ view: V,
        width: CGFloat,
        height: CGFloat,
        style: UIUserInterfaceStyle
    ) -> UIImage {
        let root = view
            .frame(width: width, height: height)
            .background(WriterColors.page)

        let controller = UIHostingController(rootView: root)
        controller.overrideUserInterfaceStyle = style
        controller.view.bounds = CGRect(origin: .zero, size: CGSize(width: width, height: height))
        controller.view.backgroundColor = .clear
        controller.view.setNeedsLayout()
        controller.view.layoutIfNeeded()

        let format = UIGraphicsImageRendererFormat()
        format.scale = 2

        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { _ in
            controller.view.drawHierarchy(in: controller.view.bounds, afterScreenUpdates: true)
        }
    }

    private func attach(_ image: UIImage, named name: String) {
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
