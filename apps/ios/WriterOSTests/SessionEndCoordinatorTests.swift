import XCTest
@testable import WriterOS

final class SessionEndCoordinatorTests: XCTestCase {
    @MainActor
    func testSilenceTimerFiresAfterTimeoutAndCallsEndSession() async {
        let scheduler = FakeSessionEndTimerScheduler()
        let coordinator = SessionEndCoordinator(scheduler: scheduler)
        var endCallCount = 0
        var dismissCallCount = 0

        coordinator.startMonitoring(
            endSession: {
                endCallCount += 1
            },
            onDismiss: {
                dismissCallCount += 1
            },
            onError: { _ in }
        )

        XCTAssertEqual(scheduler.scheduledTimers.count, 1)
        XCTAssertEqual(scheduler.scheduledDelays, [SessionEndCoordinator.silenceTimeoutSeconds])

        await scheduler.scheduledTimers[0].fire()

        XCTAssertEqual(endCallCount, 1)
        XCTAssertEqual(dismissCallCount, 1)
    }

    @MainActor
    func testActivityResetsTheTimer() async {
        let scheduler = FakeSessionEndTimerScheduler()
        let coordinator = SessionEndCoordinator(scheduler: scheduler)
        var endCallCount = 0

        coordinator.startMonitoring(
            endSession: {
                endCallCount += 1
            },
            onDismiss: {},
            onError: { _ in }
        )
        let firstTimer = scheduler.scheduledTimers[0]

        coordinator.recordActivity()

        XCTAssertTrue(firstTimer.isCancelled)
        XCTAssertEqual(scheduler.scheduledTimers.count, 2)

        await firstTimer.fire()
        XCTAssertEqual(endCallCount, 0)

        await scheduler.scheduledTimers[1].fire()
        XCTAssertEqual(endCallCount, 1)
    }

    @MainActor
    func testTimerCancelsOnExplicitEnd() async {
        let scheduler = FakeSessionEndTimerScheduler()
        let coordinator = SessionEndCoordinator(scheduler: scheduler)
        var endCallCount = 0
        var dismissCallCount = 0

        coordinator.startMonitoring(
            endSession: {
                endCallCount += 1
            },
            onDismiss: {
                dismissCallCount += 1
            },
            onError: { _ in }
        )
        let timer = scheduler.scheduledTimers[0]

        await coordinator.endSessionAndDismiss()
        await timer.fire()

        XCTAssertTrue(timer.isCancelled)
        XCTAssertEqual(endCallCount, 1)
        XCTAssertEqual(dismissCallCount, 1)
    }

    @MainActor
    func testTimerCancelsOnViewDismiss() async {
        let scheduler = FakeSessionEndTimerScheduler()
        let coordinator = SessionEndCoordinator(scheduler: scheduler)
        var endCallCount = 0
        var dismissCallCount = 0

        coordinator.startMonitoring(
            endSession: {
                endCallCount += 1
            },
            onDismiss: {
                dismissCallCount += 1
            },
            onError: { _ in }
        )
        let timer = scheduler.scheduledTimers[0]

        coordinator.cancel()
        await timer.fire()

        XCTAssertTrue(timer.isCancelled)
        XCTAssertEqual(endCallCount, 0)
        XCTAssertEqual(dismissCallCount, 0)
    }
}

@MainActor
private final class FakeSessionEndTimerScheduler: SessionEndTimerScheduling {
    private(set) var scheduledDelays: [TimeInterval] = []
    private(set) var scheduledTimers: [FakeSessionEndTimer] = []

    func schedule(
        after seconds: TimeInterval,
        operation: @escaping @MainActor () async -> Void
    ) -> SessionEndTimer {
        let timer = FakeSessionEndTimer(operation: operation)
        scheduledDelays.append(seconds)
        scheduledTimers.append(timer)
        return timer
    }
}

@MainActor
private final class FakeSessionEndTimer: SessionEndTimer {
    private let operation: @MainActor () async -> Void
    private(set) var isCancelled = false

    init(operation: @escaping @MainActor () async -> Void) {
        self.operation = operation
    }

    func cancel() {
        isCancelled = true
    }

    func fire() async {
        guard !isCancelled else { return }
        await operation()
    }
}
