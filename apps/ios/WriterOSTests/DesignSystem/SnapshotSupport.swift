import SwiftUI
import UIKit
import XCTest
@testable import WriterOS

enum WriterSnapshotTone: String, CaseIterable {
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

/// Renders a view to a deterministic PNG and compares it against a recorded
/// baseline under `__Snapshots__/`, in both light and night tones. On first run
/// (no baseline) it records the PNG and fails, matching DesignSystemSnapshotTests.
@MainActor
func assertWriterSnapshots(
    named name: String,
    size: CGSize = CGSize(width: 390, height: 844),
    file: StaticString = #filePath,
    line: UInt = #line,
    @ViewBuilder view: () -> some View
) throws {
    let rootView = view()
    for tone in WriterSnapshotTone.allCases {
        let image = renderSnapshot(view: rootView, size: size, style: tone.style)
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

@MainActor
private func renderSnapshot(
    view: some View,
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
