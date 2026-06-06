import SwiftUI

@MainActor
struct InboxView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var inboxStore: InboxStore
    @State private var draft = ""
    @State private var projects: [Project] = []
    @State private var isSubmitting = false
    @State private var isLoadingProjects = false
    @State private var errorMessage: String?

    // Pending items live in the shared InboxStore so the Today "Captured" count
    // reflects filings/deposits the moment they happen here.
    private var pendingItems: [InboxItem] { inboxStore.pendingItems }
    private var isLoading: Bool { inboxStore.isLoading || isLoadingProjects }

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

    private func reload() async {
        guard let config = configStore.config else {
            errorMessage = APIError.unauthorized.localizedDescription
            return
        }
        isLoadingProjects = true
        do {
            let client = APIClient(config: config)
            projects = try await client.listProjects()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoadingProjects = false
        await inboxStore.reload(config: config)
        if let storeError = inboxStore.errorMessage {
            errorMessage = storeError
        }
    }

    private func submitDump() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, let config = configStore.config else { return }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            try await inboxStore.deposit(config: config, content: content, surface: "ios-app-dump")
            draft = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func confirm(_ item: InboxItem, projectId: UUID) async {
        guard let config = configStore.config else { return }
        do {
            try await inboxStore.confirm(config: config, item: item, projectId: projectId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
