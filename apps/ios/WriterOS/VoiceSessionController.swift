import AVFoundation
import Combine
import Speech

enum VoiceError: Equatable, LocalizedError {
    case micDenied
    case speechDenied
    case recognizerUnavailable

    var errorDescription: String? {
        switch self {
        case .micDenied:
            "Microphone permission is required to record."
        case .speechDenied:
            "Speech recognition permission is required to transcribe."
        case .recognizerUnavailable:
            "Speech recognition is unavailable on this device."
        }
    }
}

enum VoiceSessionState: Equatable {
    case idle
    case requestingPermission
    case recording
    case finalizing
    case error(VoiceError)
}

enum SpeechPermissionResult: Equatable {
    case granted
    case micDenied
    case speechDenied
}

typealias SpeechTranscriptHandler = @MainActor (_ transcript: String, _ isFinal: Bool) -> Void

@MainActor
protocol SpeechRecognitionSession: AnyObject {
    func finish() async -> String
    func cancel()
}

@MainActor
protocol SpeechRecognizing: AnyObject {
    var isAvailable: Bool { get }
    func requestPermissions() async -> SpeechPermissionResult
    func startRecognition(onTranscript: @escaping SpeechTranscriptHandler) throws -> SpeechRecognitionSession
}

@MainActor
final class VoiceSessionController: ObservableObject {
    @Published private(set) var state: VoiceSessionState = .idle
    @Published var liveTranscript = ""
    @Published var finalTranscript = ""

    private let recognizer: SpeechRecognizing
    private var recognitionSession: SpeechRecognitionSession?
    private var operationID = UUID()

    init(recognizer: SpeechRecognizing = AppleSpeechRecognizer()) {
        self.recognizer = recognizer
    }

    func togglePTT() async {
        switch state {
        case .idle, .error:
            await startRecording()
        case .recording:
            await finalizeRecording()
        case .requestingPermission, .finalizing:
            return
        }
    }

    func reset() {
        operationID = UUID()
        recognitionSession?.cancel()
        recognitionSession = nil
        liveTranscript = ""
        finalTranscript = ""
        state = .idle
    }

    private func startRecording() async {
        operationID = UUID()
        let currentOperationID = operationID
        liveTranscript = ""
        finalTranscript = ""
        state = .requestingPermission

        let permission = await recognizer.requestPermissions()
        guard currentOperationID == operationID else { return }

        switch permission {
        case .granted:
            break
        case .micDenied:
            state = .error(.micDenied)
            return
        case .speechDenied:
            state = .error(.speechDenied)
            return
        }

        guard recognizer.isAvailable else {
            state = .error(.recognizerUnavailable)
            return
        }

        do {
            let session = try recognizer.startRecognition { [weak self] transcript, isFinal in
                guard let self else { return }
                self.liveTranscript = transcript
                if isFinal {
                    self.finalTranscript = transcript
                }
            }
            guard currentOperationID == operationID else {
                session.cancel()
                return
            }

            recognitionSession = session
            state = .recording
        } catch {
            state = .error(.recognizerUnavailable)
        }
    }

    private func finalizeRecording() async {
        guard let session = recognitionSession else {
            state = .idle
            return
        }

        let currentOperationID = operationID
        state = .finalizing
        let transcript = await session.finish()
        guard currentOperationID == operationID else { return }

        liveTranscript = transcript
        finalTranscript = transcript
        recognitionSession = nil
        state = .idle
    }
}

@MainActor
final class AppleSpeechRecognizer: SpeechRecognizing {
    private let recognizer = SFSpeechRecognizer()

    var isAvailable: Bool {
        recognizer?.isAvailable == true && recognizer?.supportsOnDeviceRecognition == true
    }

    func requestPermissions() async -> SpeechPermissionResult {
        let micGranted = await requestMicrophonePermission()
        guard micGranted else { return .micDenied }

        let speechGranted = await requestSpeechPermission()
        guard speechGranted else { return .speechDenied }

        return .granted
    }

    func startRecognition(onTranscript: @escaping SpeechTranscriptHandler) throws -> SpeechRecognitionSession {
        guard let recognizer, recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
            throw VoiceError.recognizerUnavailable
        }

        let audioEngine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        let session = AppleSpeechRecognitionSession(
            audioEngine: audioEngine,
            request: request,
            audioSession: audioSession
        )
        let task = recognizer.recognitionTask(with: request) { [weak session] result, error in
            Task { @MainActor in
                if let result {
                    let transcript = result.bestTranscription.formattedString
                    session?.updateTranscript(transcript, isFinal: result.isFinal)
                    onTranscript(transcript, result.isFinal)
                }

                if error != nil {
                    session?.complete()
                }
            }
        }
        session.setTask(task)

        audioEngine.prepare()
        try audioEngine.start()
        return session
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private func requestSpeechPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }
}

@MainActor
private final class AppleSpeechRecognitionSession: SpeechRecognitionSession {
    private let audioEngine: AVAudioEngine
    private let request: SFSpeechAudioBufferRecognitionRequest
    private let audioSession: AVAudioSession
    private var task: SFSpeechRecognitionTask?
    private var latestTranscript = ""
    private var didComplete = false

    init(
        audioEngine: AVAudioEngine,
        request: SFSpeechAudioBufferRecognitionRequest,
        audioSession: AVAudioSession
    ) {
        self.audioEngine = audioEngine
        self.request = request
        self.audioSession = audioSession
    }

    func setTask(_ task: SFSpeechRecognitionTask) {
        self.task = task
    }

    func updateTranscript(_ transcript: String, isFinal: Bool) {
        latestTranscript = transcript
        if isFinal {
            complete()
        }
    }

    func finish() async -> String {
        stopAudio()
        task?.finish()
        request.endAudio()
        complete()
        return latestTranscript
    }

    func cancel() {
        stopAudio()
        task?.cancel()
        complete()
    }

    func complete() {
        guard !didComplete else { return }
        didComplete = true
    }

    private func stopAudio() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
    }
}
