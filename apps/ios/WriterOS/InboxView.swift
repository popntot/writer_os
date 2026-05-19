import SwiftUI

@MainActor
struct InboxView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @State private var draft = ""
    @State private var projects: [Project] = []
    @State private var pendingItems: [InboxItem] = []
    @State private var isSubmitting = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Dump") {
                    DumpView(
                        text: $draft,
                        isSubmitting: isSubmitting,
                        onSubmit: submitDump,
                    )
                }

                Section("Pending") {
                    if isLoading {
                        ProgressView()
                    } else if pendingItems.isEmpty {
                        Text("No pending items")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(pendingItems) { item in
                            pendingRow(item)
                        }
                    }
                }
            }
            .navigationTitle("Dump")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await reload() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Refresh pending inbox")
                }
            }
            .task { await reload() }
            .refreshable { await reload() }
            .alert("Inbox error", isPresented: errorPresented) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private var errorPresented: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } },
        )
    }

    private func pendingRow(_ item: InboxItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String((item.contentPreview ?? item.rawContentRef).prefix(80)))
                .font(.body)
            Text(projectTitle(for: item.proposedProjectId))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let projectId = item.proposedProjectId {
                Button("Confirm") {
                    Task { await confirm(item, projectId: projectId) }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func projectTitle(for projectId: UUID?) -> String {
        guard let projectId else { return "No project proposed" }
        return projects.first { $0.id.lowercased() == projectId.uuidString.lowercased() }?.title
            ?? projectId.uuidString
    }

    private func makeClient() throws -> APIClient {
        guard let config = configStore.config else {
            throw APIError.unauthorized
        }
        return APIClient(config: config)
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let client = try makeClient()
            async let loadedProjects = client.listProjects()
            async let loadedPending = client.listPendingInbox()
            projects = try await loadedProjects
            pendingItems = try await loadedPending
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitDump() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let client = try makeClient()
            _ = try await client.depositInbox(content: content, surface: "ios-app-dump")
            draft = ""
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func confirm(_ item: InboxItem, projectId: UUID) async {
        do {
            let client = try makeClient()
            _ = try await client.confirmInboxItem(item.id, projectId: projectId)
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
