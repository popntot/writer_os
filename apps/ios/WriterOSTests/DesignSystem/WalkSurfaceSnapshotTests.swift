import SwiftUI
import XCTest
@testable import WriterOS

@MainActor
final class WalkSurfaceSnapshotTests: XCTestCase {
    func testWalkSurfaceWithCapturedThought() throws {
        try assertWriterSnapshots(named: "walk-surface-captured") {
            WalkSurface(
                timerText: "27:14",
                capturedThought: "Work might be where belonging becomes visible, provided visibility does not become a score.",
                micLabel: "Capture",
                isListening: false,
            )
        }
    }

    func testWalkSurfaceListening() throws {
        try assertWriterSnapshots(named: "walk-surface-listening") {
            WalkSurface(
                timerText: "00:42",
                capturedThought: "Work might be where belonging becomes visible…",
                micLabel: "Listening",
                isListening: true,
            )
        }
    }

    func testWalkSurfaceWithoutCapturedThought() throws {
        try assertWriterSnapshots(named: "walk-surface-empty") {
            WalkSurface(
                timerText: "00:00",
                capturedThought: "Hold the thought. Tap to begin.",
                micLabel: "Capture",
                isListening: false,
            )
        }
    }
}
