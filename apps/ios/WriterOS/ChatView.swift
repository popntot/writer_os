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
        VStack {
            if isCreatingSession && session == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if session == nil {
                ContentUnavailableView {
                    Label("Session not started", systemImage: "exclamationmark.triangle")
                } actions: {
                    Button("Retry") {
                        Task { await startSession() }
                    }
                }
            } else {
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
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Wrap up") {
                    Task { await endSessionAndDismiss() }
                }
                .disabled(session == nil || isEndingSession)

                Button("Sync now") {
                    Task { await endSessionAndDismiss() }
                }
                .disabled(session == nil || isEndingSession)
            }
        }
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
                    dismiss()
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
}

private struct ChatMessage: Identifiable, Hashable {
    let id = UUID()
    let role: String
    var text: String
    var usage: TurnStreamUsage?
    var isError = false
}
