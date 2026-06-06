import SwiftUI

@MainActor
struct ChatView: View {
    let projectId: UUID

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var settingsStore: SettingsStore

    @StateObject private var voiceController = VoiceSessionController()
    @State private var audioPlayback: any AudioPlaying
    @State private var sessionEndCoordinator: SessionEndCoordinator
    @State private var session: Session?
    @State private var messages: [ChatMessage] = []
    @State private var draft: String = ""
    @State private var isCreatingSession = false
    @State private var isSendingTurn = false
    @State private var isEndingSession = false
    @State private var didStartSession = false
    @State private var errorMessage: String?
    @State private var showDebugChat = false
    @State private var showClose = false

    init(projectId: UUID) {
        self.projectId = projectId
        _audioPlayback = State(initialValue: AudioPlaybackEngine())
        _sessionEndCoordinator = State(initialValue: SessionEndCoordinator())
    }

    init(projectId: UUID, audioPlayback: any AudioPlaying) {
        self.projectId = projectId
        _audioPlayback = State(initialValue: audioPlayback)
        _sessionEndCoordinator = State(initialValue: SessionEndCoordinator())
    }

    init(
        projectId: UUID,
        audioPlayback: any AudioPlaying,
        sessionEndCoordinator: SessionEndCoordinator
    ) {
        self.projectId = projectId
        _audioPlayback = State(initialValue: audioPlayback)
        _sessionEndCoordinator = State(initialValue: sessionEndCoordinator)
    }

    var body: some View {
        if showClose {
            // The walk has ended; file it on the Close surface (DS-4) before
            // returning to Today. The session was already ended by the coordinator.
            CloseSurface(
                capturedNote: closeCapturedNote,
                openQuestion: nil,
                nextTitle: "Next walk",
                nextBody: "Pick this thread up when you return.",
                onReturn: { dismiss() },
            )
            .navigationBarBackButtonHidden(true)
            .toolbar(.hidden, for: .navigationBar)
        } else {
            walkScreen
                .navigationBarBackButtonHidden(true)
                .toolbar(.hidden, for: .navigationBar)
                .gesture(exitWalkGesture)
                .task {
                    guard !didStartSession else { return }
                    didStartSession = true
                    await startSession()
                }
                .onDisappear {
                    sessionEndCoordinator.cancel()
                }
                .alert(
                    "Error",
                    isPresented: Binding(
                        get: { errorMessage != nil },
                        set: { if !$0 { errorMessage = nil } },
                    ),
                ) {
                    Button("OK", role: .cancel) { errorMessage = nil }
                } message: {
                    Text(errorMessage ?? "")
                }
                .modifier(DebugChatModifier(isPresented: $showDebugChat) { debugChat })
                .modifier(DebugChatOpenGesture(isPresented: $showDebugChat))
        }
    }

    // The open question and next-session starter come from ConsolidationWorker
    // output, which isn't exposed to the client yet (parallels the Walk
    // question gap, #16). Until then the captured note carries the Close
    // surface and the rest uses calm, file-not-finish defaults.
    private var closeCapturedNote: String {
        if let lastUtterance = messages.last(where: { $0.role == "user" })?.text,
           !lastUtterance.isEmpty {
            return lastUtterance
        }
        return "Filed for the next walk."
    }

    // MARK: - Walk surface (voice-primary)

    @ViewBuilder
    private var walkScreen: some View {
        if isCreatingSession && session == nil {
            WalkSurface(
                timerText: "00:00",
                capturedThought: "Beginning the walk.",
                micLabel: "Wait",
                isListening: false,
            )
        } else if session == nil {
            WalkSurface(
                timerText: "00:00",
                capturedThought: "The walk didn’t start.",
                micLabel: "Try again",
                isListening: false,
                onMicTap: { Task { await startSession() } },
            )
        } else {
            TimelineView(.periodic(from: session?.startAt ?? Date(), by: 1)) { context in
                WalkSurface(
                    timerText: elapsedText(now: context.date),
                    capturedThought: capturedThought,
                    micLabel: micLabel,
                    isListening: voiceController.state == .recording,
                    onMicTap: { Task { await micTapped() } },
                )
            }
        }
    }

    private var exitWalkGesture: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                guard value.translation.height > 80, abs(value.translation.width) < 120 else { return }
                Task { await endSessionAndDismiss() }
            }
    }

    private var capturedThought: String {
        if showLiveTranscript {
            return voiceController.liveTranscript
        }
        if let lastUtterance = messages.last(where: { $0.role == "user" })?.text,
           !lastUtterance.isEmpty {
            return lastUtterance
        }
        return "Hold the thought. Tap to begin."
    }

    private var micLabel: String {
        switch voiceController.state {
        case .recording:
            return "Listening"
        case .finalizing, .requestingPermission:
            return "One moment"
        case .error:
            return "Try again"
        case .idle:
            return isSendingTurn ? "Thinking" : "Capture"
        }
    }

    private func elapsedText(now: Date) -> String {
        guard let start = session?.startAt else { return "00:00" }
        let seconds = max(0, Int(now.timeIntervalSince(start)))
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    /// A single mic-tap region: tap to start listening, tap again to capture the
    /// thought and send it. Drives the existing voice/turn plumbing unchanged.
    private func micTapped() async {
        guard session != nil, !isSendingTurn else { return }
        let wasRecording = voiceController.state == .recording
        await togglePTT()
        if wasRecording {
            let captured = voiceController.finalTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
            if !captured.isEmpty {
                draft = captured
                await send()
            }
        }
    }

    private var inputDisabled: Bool {
        session == nil || isCreatingSession || isSendingTurn || isEndingSession
    }

    private var pttDisabled: Bool {
        inputDisabled || voiceController.state == .requestingPermission || voiceController.state == .finalizing
    }

    private var showLiveTranscript: Bool {
        !voiceController.liveTranscript.isEmpty &&
            (voiceController.state == .recording || voiceController.state == .finalizing)
    }

    private var sendDisabled: Bool {
        inputDisabled || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func startSession() async {
        guard let config = configStore.config else { return }
        isCreatingSession = true
        do {
            let client = APIClient(config: config)
            let createdSession = try await client.createSession(projectId: projectId)
            session = createdSession
            await voiceController.startSession(
                audioCaptureDefault: settingsStore.settings?.audioCaptureDefault ?? false
            )
            sessionEndCoordinator.startMonitoring(
                endSession: {
                    let client = try makeClient()
                    _ = try await client.endSession(sessionId: createdSession.id)
                },
                onDismiss: {
                    // End of walk → file it on the Close surface, then Return
                    // dismisses back to Today.
                    showClose = true
                },
                onError: { error in
                    errorMessage = error.localizedDescription
                }
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreatingSession = false
    }

    private func togglePTT() async {
        sessionEndCoordinator.recordActivity()
        let wasRecording = voiceController.state == .recording
        await voiceController.togglePTT()

        if wasRecording && !voiceController.finalTranscript.isEmpty {
            // Pass D sends this editable draft through the SSE turn endpoint.
            draft = voiceController.finalTranscript
        }
    }

    private func send() async {
        guard let session else { return }
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !isSendingTurn else { return }

        draft = ""
        messages.append(ChatMessage(role: "user", text: message))
        messages.append(ChatMessage(role: "assistant", text: ""))
        let assistantIndex = messages.index(before: messages.endIndex)
        audioPlayback.reset()
        isSendingTurn = true
        defer { isSendingTurn = false }

        do {
            let client = try makeClient()
            let stream = try await client.streamTurn(sessionId: session.id, message: message)

            for try await event in stream {
                try handleTurnEvent(event, assistantIndex: assistantIndex)
                if case .done = event {
                    break
                }
            }
        } catch {
            appendAssistantError(error.localizedDescription, assistantIndex: assistantIndex)
        }
    }

    private func handleTurnEvent(_ event: SSEEvent, assistantIndex: Int) throws {
        guard messages.indices.contains(assistantIndex) else { return }

        switch event {
        case .text(let delta):
            messages[assistantIndex].text += delta
        case .audio(let chunkBase64, let format):
            guard format == "pcm_16000" else {
                print("Dropping unsupported audio format: \(format)")
                return
            }
            guard let data = Data(base64Encoded: chunkBase64) else {
                print("Dropping invalid base64 audio chunk")
                return
            }
            try audioPlayback.start()
            try audioPlayback.enqueue(pcmInt16Data: data)
            sessionEndCoordinator.recordActivity()
        case .usage(let usage):
            messages[assistantIndex].usage = usage
        case .done:
            return
        case .error(let message):
            appendAssistantError(message, assistantIndex: assistantIndex)
        case .unknown:
            return
        }
    }

    private func appendAssistantError(_ message: String, assistantIndex: Int) {
        guard messages.indices.contains(assistantIndex) else {
            errorMessage = message
            return
        }

        let prefix = messages[assistantIndex].text.isEmpty ? "" : "\n\n"
        messages[assistantIndex].text += "\(prefix)Error: \(message)"
        messages[assistantIndex].isError = true
    }

    private func endSessionAndDismiss() async {
        guard session != nil, !isEndingSession else { return }
        isEndingSession = true
        await sessionEndCoordinator.endSessionAndDismiss()
        isEndingSession = false
    }

    private func makeClient() throws -> APIClient {
        guard let config = configStore.config else {
            throw APIError.invalidResponse
        }
        return APIClient(config: config)
    }

    // MARK: - Debug text-mode chat
    //
    // Voice is the primary surface (PRD + style guide §10); typed turns are not
    // in the design language. This raw transcript view is kept only as a debug
    // affordance — reachable via a long-press in DEBUG builds — for inspecting
    // turns, costs, and errors without speaking.
    @ViewBuilder
    private var debugChat: some View {
        NavigationStack {
            VStack {
                List(messages) { message in
                    VStack(alignment: .leading) {
                        Text(message.role)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(message.text)
                            .foregroundStyle(message.isError ? Color.red : Color.primary)
                        if let usage = message.usage {
                            Text("Cost: \(usage.llm.costUsd + (usage.tts?.costUsd ?? 0), format: .currency(code: "USD"))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    if showLiveTranscript {
                        Text(voiceController.liveTranscript)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if case .error(let voiceError) = voiceController.state {
                        Text(voiceError.localizedDescription)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    HStack {
                        Button {
                            Task { await togglePTT() }
                        } label: {
                            Image(systemName: voiceController.state == .recording ? "mic.fill" : "mic")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(voiceController.state == .recording ? .red : .accentColor)
                        .disabled(pttDisabled)
                        .accessibilityLabel(
                            voiceController.state == .recording ? "Stop recording" : "Start recording"
                        )

                        TextField("Message", text: $draft, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .disabled(inputDisabled)
                            .onSubmit {
                                Task { await send() }
                            }
                            .onChange(of: draft) { _, _ in
                                sessionEndCoordinator.recordActivity()
                            }
                        Button("Send") {
                            Task { await send() }
                        }
                        .disabled(sendDisabled)
                    }
                }
                .padding()
            }
            .navigationTitle("Debug chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showDebugChat = false }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Wrap up") {
                        Task { await endSessionAndDismiss() }
                    }
                    .disabled(session == nil || isEndingSession)
                }
            }
        }
    }
}

private struct ChatMessage: Identifiable, Hashable {
    let id = UUID()
    let role: String
    var text: String
    var usage: TurnStreamUsage?
    var isError = false
}

// MARK: - Walk surface (snapshot-testable)

/// The calmest surface (style guide §10): a timer, one captured thought, and one
/// minimal capture control. No transcript feed, no assistant replies, no chrome.
/// Pure and data-driven so the snapshot tests render it without voice plumbing.
struct WalkSurface: View {
    let timerText: String
    let capturedThought: String
    let micLabel: String
    let isListening: Bool

    var onMicTap: () -> Void = {}

    var body: some View {
        PageShell(pageMark: "Walk") {
            VStack(alignment: .leading, spacing: WriterSpacing.space5) {
                StateLabel("Walk")

                Text(timerText)
                    .font(WriterTypography.mono(size: 14.5, weight: .medium))
                    .foregroundStyle(WriterColors.ink2)

                Spacer(minLength: WriterSpacing.space6)

                VStack(alignment: .leading, spacing: WriterSpacing.space2) {
                    StateLabel("Captured", state: .active)

                    Text(capturedThought)
                        .font(WriterTypography.primaryQuestion)
                        .foregroundStyle(WriterColors.ink)
                        .lineSpacing(4.42)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: WriterSpacing.space6)

                captureControl
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var captureControl: some View {
        VStack(spacing: 0) {
            Hairline(.ink)

            Text(micLabel.uppercased())
                .font(WriterTypography.metadata)
                .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                .foregroundStyle(isListening ? WriterColors.active : WriterColors.ink)
                .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onMicTap)
        .accessibilityLabel(isListening ? "Stop capturing" : "Capture a thought")
    }
}

// MARK: - Debug-only chat presentation

/// Presents the debug transcript view only in DEBUG builds; a no-op otherwise.
private struct DebugChatModifier<SheetContent: View>: ViewModifier {
    @Binding var isPresented: Bool
    @ViewBuilder var sheet: () -> SheetContent

    func body(content: Content) -> some View {
        #if DEBUG
        content.sheet(isPresented: $isPresented, content: sheet)
        #else
        content
        #endif
    }
}

/// Long-press opens the debug chat — only wired in DEBUG builds.
private struct DebugChatOpenGesture: ViewModifier {
    @Binding var isPresented: Bool

    func body(content: Content) -> some View {
        #if DEBUG
        content.simultaneousGesture(
            LongPressGesture(minimumDuration: 1.0).onEnded { _ in isPresented = true }
        )
        #else
        content
        #endif
    }
}
