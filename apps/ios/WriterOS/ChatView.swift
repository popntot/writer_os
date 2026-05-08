import SwiftUI

@MainActor
struct ChatView: View {
    let projectId: UUID

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var configStore: AppConfigStore

    @StateObject private var voiceController = VoiceSessionController()
    @State private var session: Session?
    @State private var messages: [ChatMessage] = []
    @State private var draft: String = ""
    @State private var isCreatingSession = false
    @State private var isSendingTurn = false
    @State private var isEndingSession = false
    @State private var didStartSession = false
    @State private var errorMessage: String?

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
            ToolbarItem(placement: .topBarTrailing) {
                Button("End") {
                    Task { await endSession() }
                }
                .disabled(session == nil || isEndingSession)
            }
        }
        .task {
            guard !didStartSession else { return }
            didStartSession = true
            await startSession()
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
            session = try await client.createSession(projectId: projectId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreatingSession = false
    }

    private func togglePTT() async {
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
        isSendingTurn = true
        do {
            let client = try makeClient()
            let response = try await client.sendTurn(sessionId: session.id, message: message)
            messages.append(ChatMessage(role: "assistant", text: response.text))
        } catch {
            errorMessage = error.localizedDescription
        }
        isSendingTurn = false
    }

    private func endSession() async {
        guard let session else { return }
        isEndingSession = true
        do {
            let client = try makeClient()
            _ = try await client.endSession(sessionId: session.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
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
    let text: String
}
