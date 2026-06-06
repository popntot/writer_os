import SwiftUI
import XCTest
@testable import WriterOS

@MainActor
final class CapturedSurfaceSnapshotTests: XCTestCase {
    private let populatedItems = [
        CapturedSurfaceItem(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            state: .source,
            stateLabel: "Captured",
            title: "Attention is not only productivity",
            body: "Attention is not only a productivity input.",
            sourceLabel: "Captured Text",
            quote: "Attention is not only a productivity input. It is how work makes belonging legible.",
            context: "Captured from iOS.",
            proposedProjectTitle: "After Abundance",
        ),
        CapturedSurfaceItem(
            id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
            state: .ready,
            stateLabel: "Triaged",
            title: "The desk needs one reading",
            body: "The desk needs one reading order, not another management surface.",
            sourceLabel: "Captured URL",
            quote: "The desk needs one reading order, not another management surface.",
            context: "Proposed for After Abundance.",
            proposedProjectTitle: "After Abundance",
        ),
        CapturedSurfaceItem(
            id: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
            state: .open,
            stateLabel: "Open",
            title: "What remains unresolved after filing",
            body: "What remains unresolved after filing the session notes?",
            sourceLabel: "Captured Audio",
            quote: "What remains unresolved after filing the session notes?",
            context: "Surfaced as an open question.",
            proposedProjectTitle: nil,
        ),
    ]

    func testCapturedSurfacePopulated() throws {
        try assertWriterSnapshots(named: "captured-surface-populated") {
            CapturedSurface(items: populatedItems, isLoading: false)
        }
    }

    func testCapturedSurfaceEmpty() throws {
        try assertWriterSnapshots(named: "captured-surface-empty") {
            CapturedSurface(items: [], isLoading: false)
        }
    }
}
