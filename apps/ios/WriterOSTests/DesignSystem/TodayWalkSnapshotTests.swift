import SwiftUI
import XCTest
@testable import WriterOS

@MainActor
final class TodayWalkSnapshotTests: XCTestCase {
    func testTodayWalkWithQuestion() throws {
        try assertWriterSnapshots(named: "today-walk-question") {
            TodaySurface(
                mode: .walk,
                dateText: "Wed 18 Jun",
                title: "After Abundance",
                projectItems: [
                    WorkIndexItem(id: "1", text: "After Abundance", state: .active, mark: "Walk"),
                ],
                walkQuestion: "If money no longer assigns dignity, what does effort feel like on a Tuesday?",
                inboxCount: 1,
                hasUnreviewed: true,
            )
        }
    }

    func testTodayWalkEmptyState() throws {
        try assertWriterSnapshots(named: "today-walk-empty") {
            TodaySurface(
                mode: .walk,
                dateText: "Wed 18 Jun",
                title: "Today",
                projectItems: [],
                walkQuestion: "Nothing waiting. Begin.",
                inboxCount: 0,
                hasUnreviewed: false,
            )
        }
    }
}
