import XCTest
@testable import WriterOS

final class VoiceSessionControllerTests: XCTestCase {
    @MainActor
    func testTogglePTTHappyPathTransitionsIdleRecordingFinalizingIdle() async {
        let session = FakeRecognitionSession()
        let recognizer = FakeSpeechRecognizer(session: session)
        let controller = VoiceSessionController(recognizer: recognizer)

        XCTAssertEqual(controller.state, .idle)

        await controller.togglePTT()

        XCTAssertEqual(controller.state, .recording)

        let finalizeTask = Task { @MainActor in await controller.togglePTT() }
        await session.waitForFinishStarted()

        XCTAssertEqual(controller.state, .finalizing)

        session.completeFinish("Final transcript")
        await finalizeTask.value

        XCTAssertEqual(controller.state, .idle)
        XCTAssertEqual(controller.finalTranscript, "Final transcript")
        XCTAssertEqual(controller.liveTranscript, "Final transcript")
    }

    @MainActor
    func testPermissionDeniedTransitionsToErrorState() async {
        let recognizer = FakeSpeechRecognizer(permissionResult: .micDenied)
        let controller = VoiceSessionController(recognizer: recognizer)

        await controller.togglePTT()

        XCTAssertEqual(controller.state, .error(.micDenied))
    }

    @MainActor
    func testRecognizerUnavailableTransitionsToErrorState() async {
        let recognizer = FakeSpeechRecognizer(isAvailable: false)
        let controller = VoiceSessionController(recognizer: recognizer)

        await controller.togglePTT()

        XCTAssertEqual(controller.state, .error(.recognizerUnavailable))
    }

    @MainActor
    func testResetFromEachNonIdleStateReturnsToIdle() async {
        let requestingRecognizer = FakeSpeechRecognizer(permissionResult: nil)
        let requestingController = VoiceSessionController(recognizer: requestingRecognizer)
        let permissionTask = Task { @MainActor in await requestingController.togglePTT() }
        await requestingRecognizer.waitForPermissionRequest()

        XCTAssertEqual(requestingController.state, .requestingPermission)

        requestingController.reset()
        requestingRecognizer.completePermission(.granted)
        await permissionTask.value

        XCTAssertEqual(requestingController.state, .idle)

        let recordingSession = FakeRecognitionSession()
        let recordingRecognizer = FakeSpeechRecognizer(session: recordingSession)
        let recordingController = VoiceSessionController(recognizer: recordingRecognizer)
        await recordingController.togglePTT()

        XCTAssertEqual(recordingController.state, .recording)

        recordingController.reset()

        XCTAssertEqual(recordingController.state, .idle)
        XCTAssertEqual(recordingSession.cancelCount, 1)

        let finalizingSession = FakeRecognitionSession()
        let finalizingRecognizer = FakeSpeechRecognizer(session: finalizingSession)
        let finalizingController = VoiceSessionController(recognizer: finalizingRecognizer)
        await finalizingController.togglePTT()
        let finalizingTask = Task { @MainActor in await finalizingController.togglePTT() }
        await finalizingSession.waitForFinishStarted()

        XCTAssertEqual(finalizingController.state, .finalizing)

        finalizingController.reset()
        finalizingSession.completeFinish("ignored")
        await finalizingTask.value

        XCTAssertEqual(finalizingController.state, .idle)
        XCTAssertEqual(finalizingController.finalTranscript, "")

        let errorRecognizer = FakeSpeechRecognizer(permissionResult: .speechDenied)
        let errorController = VoiceSessionController(recognizer: errorRecognizer)
        await errorController.togglePTT()

        XCTAssertEqual(errorController.state, .error(.speechDenied))

        errorController.reset()

        XCTAssertEqual(errorController.state, .idle)
    }

    @MainActor
    func testLiveTranscriptUpdatesAsRecognitionResultsArrive() async {
        let recognizer = FakeSpeechRecognizer()
        let controller = VoiceSessionController(recognizer: recognizer)

        await controller.togglePTT()

        recognizer.emit("partial words", isFinal: false)

        XCTAssertEqual(controller.liveTranscript, "partial words")
        XCTAssertEqual(controller.finalTranscript, "")

        recognizer.emit("final words", isFinal: true)

        XCTAssertEqual(controller.liveTranscript, "final words")
        XCTAssertEqual(controller.finalTranscript, "final words")
    }
}

@MainActor
private final class FakeSpeechRecognizer: SpeechRecognizing {
    var isAvailable: Bool

    private let permissionResult: SpeechPermissionResult?
    private let session: FakeRecognitionSession
    private var onTranscript: SpeechTranscriptHandler?
    private var didRequestPermissions = false
    private var permissionRequestContinuation: CheckedContinuation<Void, Never>?
    private var permissionContinuation: CheckedContinuation<SpeechPermissionResult, Never>?

    init(
        permissionResult: SpeechPermissionResult? = .granted,
        isAvailable: Bool = true,
        session: FakeRecognitionSession = FakeRecognitionSession()
    ) {
        self.permissionResult = permissionResult
        self.isAvailable = isAvailable
        self.session = session
    }

    func requestPermissions() async -> SpeechPermissionResult {
        didRequestPermissions = true
        permissionRequestContinuation?.resume()
        permissionRequestContinuation = nil

        if let permissionResult {
            return permissionResult
        }

        return await withCheckedContinuation { continuation in
            permissionContinuation = continuation
        }
    }

    func startRecognition(onTranscript: @escaping SpeechTranscriptHandler) throws -> SpeechRecognitionSession {
        self.onTranscript = onTranscript
        return session
    }

    func waitForPermissionRequest() async {
        if didRequestPermissions {
            return
        }

        await withCheckedContinuation { continuation in
            permissionRequestContinuation = continuation
        }
    }

    func completePermission(_ result: SpeechPermissionResult) {
        permissionContinuation?.resume(returning: result)
        permissionContinuation = nil
    }

    func emit(_ transcript: String, isFinal: Bool) {
        onTranscript?(transcript, isFinal)
    }
}

@MainActor
private final class FakeRecognitionSession: SpeechRecognitionSession {
    private(set) var cancelCount = 0

    private var didStartFinish = false
    private var finishStartContinuation: CheckedContinuation<Void, Never>?
    private var finishContinuation: CheckedContinuation<String, Never>?

    func finish() async -> String {
        didStartFinish = true
        finishStartContinuation?.resume()
        finishStartContinuation = nil

        return await withCheckedContinuation { continuation in
            finishContinuation = continuation
        }
    }

    func cancel() {
        cancelCount += 1
        finishContinuation?.resume(returning: "")
        finishContinuation = nil
    }

    func waitForFinishStarted() async {
        if didStartFinish {
            return
        }

        await withCheckedContinuation { continuation in
            finishStartContinuation = continuation
        }
    }

    func completeFinish(_ transcript: String) {
        finishContinuation?.resume(returning: transcript)
        finishContinuation = nil
    }
}
