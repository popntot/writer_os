import SwiftUI
import XCTest
@testable import WriterOS

@MainActor
final class TodayDeskSnapshotTests: XCTestCase {
    private let projects = [
        WorkIndexItem(id: "1", text: "After Abundance — opening essay.", state: .active, mark: "Walk"),
        WorkIndexItem(id: "2", text: "Work after coercion — lineage pass.", state: .active, mark: "Walk"),
        WorkIndexItem(id: "3", text: "No scoreboard — desk-test the frame.", state: .active, mark: "Walk"),
    ]

    func testTodayDeskWithInboxCount() throws {
        try assertWriterSnapshots(named: "today-desk-with-inbox") {
            TodaySurface(
                mode: .desk,
                dateText: "Wed 18 Jun",
                title: "Projects",
                projectItems: projects,
                walkQuestion: "Nothing waiting. Begin.",
                inboxCount: 3,
                hasUnreviewed: true,
            )
        }
    }

    func testTodayDeskWithoutInboxCount() throws {
        try assertWriterSnapshots(named: "today-desk-empty-inbox") {
            TodaySurface(
                mode: .desk,
                dateText: "Wed 18 Jun",
                title: "Projects",
                projectItems: projects,
                walkQuestion: "Nothing waiting. Begin.",
                inboxCount: 0,
                hasUnreviewed: false,
            )
        }
    }
}
