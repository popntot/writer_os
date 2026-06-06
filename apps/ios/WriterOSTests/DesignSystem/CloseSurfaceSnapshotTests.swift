import SwiftUI
import XCTest
@testable import WriterOS

@MainActor
final class CloseSurfaceSnapshotTests: XCTestCase {
    func testCloseSurfaceWithOpenQuestion() throws {
        try assertWriterSnapshots(named: "close-surface-open-question") {
            CloseSurface(
                capturedNote: "The strongest thread was that belonging at work becomes visible through shared attention, not through scoring the worker.",
                openQuestion: "What would a workplace protect if attention were treated as a commons?",
                nextTitle: "Return to the commons frame",
                nextBody: "Open with belonging, then test the attention claim.",
            )
        }
    }

    func testCloseSurfaceWithoutOpenQuestion() throws {
        try assertWriterSnapshots(named: "close-surface-no-question") {
            CloseSurface(
                capturedNote: "The walk filed a cleaner opening move: attention first, incentives second, belonging as the proof.",
                openQuestion: nil,
                nextTitle: "Draft the first page",
                nextBody: "Begin with the attention claim and keep the question open.",
            )
        }
    }
}
