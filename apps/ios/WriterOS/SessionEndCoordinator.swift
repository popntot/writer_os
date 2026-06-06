import SwiftUI

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

struct CloseSurface: View {
    let capturedNote: String
    let openQuestion: String?
    let nextTitle: String
    let nextBody: String
    var onReturn: () -> Void = {}

    var body: some View {
        PageShell(pageMark: "Close") {
            VStack(alignment: .leading, spacing: WriterSpacing.space5) {
                StateLabel("Filed", state: .ready)

                capturedBlock

                if let openQuestion, !openQuestion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    PrimaryQuestion(openQuestion)
                }

                QuietRow(
                    state: .ready,
                    stateLabel: "Next",
                    title: nextTitle,
                    body: nextBody,
                )

                Spacer(minLength: WriterSpacing.space5)

                returnButton
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var capturedBlock: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space2) {
            StateLabel("Captured note", state: .active)

            Text(capturedNote)
                .font(WriterTypography.body)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(7.2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, WriterSpacing.space3)
        .overlay(alignment: .bottom) {
            Hairline(.hairline)
        }
    }

    private var returnButton: some View {
        Button(action: onReturn) {
            VStack(spacing: 0) {
                Hairline(.ink)

                HStack(spacing: 0) {
                    Hairline(.ink, axis: .vertical)

                    Text("RETURN")
                        .font(WriterTypography.metadata)
                        .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                        .foregroundStyle(WriterColors.ink)
                        .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)

                    Hairline(.ink, axis: .vertical)
                }

                Hairline(.ink)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Return")
    }
}
