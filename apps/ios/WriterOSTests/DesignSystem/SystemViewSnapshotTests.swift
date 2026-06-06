import SwiftUI
import XCTest
@testable import WriterOS

@MainActor
final class SystemViewSnapshotTests: XCTestCase {
    // The full System page is taller than one screen; capture it at full height
    // so every section (Audio, Identity, Spine, Rules) is verified in one shot.
    // (A ScrollView renders empty under the harness's drawHierarchy, so the
    // non-scrolling column is what gets snapshotted.)
    func testSystemViewFull() throws {
        try assertWriterSnapshots(
            named: "system-view-full",
            size: CGSize(width: 390, height: 2400),
        ) {
            SystemSurfaceFixture(mode: .full)
        }
    }

    func testSystemViewIdentitySetup() throws {
        try assertWriterSnapshots(named: "system-view-identity-setup") {
            SystemSurfaceFixture(mode: .identitySetup)
        }
    }
}

private struct SystemSurfaceFixture: View {
    let mode: SystemSurfaceMode

    @State private var apiURLString = "http://192.168.1.10:8787"
    @State private var apiSecret = "local-secret"

    var body: some View {
        SystemSurface(
            mode: mode,
            settings: Settings(
                id: "singleton",
                audioCaptureDefault: true,
                audioRetentionHotDays: 14,
                audioRetentionColdDays: 120,
                locationTagDefault: false,
                updatedAt: "2026-06-06T09:00:00.000Z"
            ),
            isLoadingSettings: false,
            isSavingSettings: false,
            hasSavedSettings: true,
            apiURLString: $apiURLString,
            apiSecret: $apiSecret,
            validationError: nil,
            projectTitle: "After Abundance",
            trueLine: TrueLineDocument(
                projectId: "project-1",
                version: 3,
                content: "Attention is not only a productivity input. It is the material by which a workplace makes belonging legible.",
                sourceSessionId: "session-3",
                committedAt: "2026-06-06T09:12:00.000Z",
                contributionSummary: "Filed the belonging-through-attention frame.",
            ),
            spineMessage: "Current project TrueLine.",
        )
    }
}
