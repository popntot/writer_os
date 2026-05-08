import Foundation

@MainActor
protocol SessionEndTimer: AnyObject {
    func cancel()
}

@MainActor
protocol SessionEndTimerScheduling: AnyObject {
    func schedule(
        after seconds: TimeInterval,
        operation: @escaping @MainActor () async -> Void
    ) -> SessionEndTimer
}

@MainActor
final class SessionEndCoordinator {
    static let silenceTimeoutSeconds: TimeInterval = 15 * 60

    private let scheduler: SessionEndTimerScheduling
    private var timer: SessionEndTimer?
    private var endSession: (@MainActor () async throws -> Void)?
    private var onDismiss: (@MainActor () -> Void)?
    private var onError: (@MainActor (Error) -> Void)?
    private var isMonitoring = false
    private var isEnding = false

    init(scheduler: SessionEndTimerScheduling = TaskSessionEndTimerScheduler()) {
        self.scheduler = scheduler
    }

    func startMonitoring(
        endSession: @escaping @MainActor () async throws -> Void,
        onDismiss: @escaping @MainActor () -> Void,
        onError: @escaping @MainActor (Error) -> Void
    ) {
        self.endSession = endSession
        self.onDismiss = onDismiss
        self.onError = onError
        isMonitoring = true
        rescheduleTimer()
    }

    func recordActivity() {
        guard isMonitoring, !isEnding else { return }
        rescheduleTimer()
    }

    func endSessionAndDismiss() async {
        guard isMonitoring, !isEnding, let endSession else { return }

        isEnding = true
        cancelTimer()

        do {
            try await endSession()
            isMonitoring = false
            isEnding = false
            onDismiss?()
        } catch {
            isEnding = false
            onError?(error)
            if isMonitoring {
                rescheduleTimer()
            }
        }
    }

    func cancel() {
        cancelTimer()
        isMonitoring = false
        isEnding = false
        endSession = nil
        onDismiss = nil
        onError = nil
    }

    private func rescheduleTimer() {
        cancelTimer()
        timer = scheduler.schedule(after: Self.silenceTimeoutSeconds) { [weak self] in
            await self?.endSessionAndDismiss()
        }
    }

    private func cancelTimer() {
        timer?.cancel()
        timer = nil
    }
}

@MainActor
final class TaskSessionEndTimerScheduler: SessionEndTimerScheduling {
    func schedule(
        after seconds: TimeInterval,
        operation: @escaping @MainActor () async -> Void
    ) -> SessionEndTimer {
        let task = Task { @MainActor in
            let nanoseconds = UInt64(max(0, seconds) * 1_000_000_000)
            try? await Task.sleep(nanoseconds: nanoseconds)
            guard !Task.isCancelled else { return }
            await operation()
        }

        return TaskSessionEndTimer(task: task)
    }
}

@MainActor
private final class TaskSessionEndTimer: SessionEndTimer {
    private let task: Task<Void, Never>

    init(task: Task<Void, Never>) {
        self.task = task
    }

    func cancel() {
        task.cancel()
    }
}
