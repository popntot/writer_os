import SwiftUI

// MARK: - Pure surface (snapshot-testable)

/// The Captured screen composed only from design-system primitives.
///
/// It takes plain item data and callbacks so snapshots render without network,
/// environment objects, or store state. `InboxView` supplies live data.
struct CapturedSurface: View {
    let items: [CapturedSurfaceItem]
    let isLoading: Bool

    /// The live screen scrolls; snapshots render the plain column because
    /// ScrollView renders empty under the snapshot harness's drawHierarchy.
    var scrollable: Bool = false

    var onTapItem: (UUID) -> Void = { _ in }
    var onTapNewCapture: () -> Void = {}

    var body: some View {
        PageShell(pageMark: "Captured") {
            if scrollable {
                ScrollView {
                    column
                }
            } else {
                column
            }
        }
    }

    private var column: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space5) {
            StateLabel("Captured")

            Text("Captured")
                .font(WriterTypography.sectionHeading)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(0.84)
                .fixedSize(horizontal: false, vertical: true)

            capturedList

            QuietRow(
                state: .inactive,
                stateLabel: "New",
                title: "New capture",
                body: "Add a text note to the captured stack.",
            )
            .contentShape(Rectangle())
            .onTapGesture(perform: onTapNewCapture)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, WriterSpacing.space7)
    }

    @ViewBuilder
    private var capturedList: some View {
        if isLoading {
            QuietRow(
                state: .inactive,
                stateLabel: "Wait",
                title: "Reading captures",
                body: "Captured material is loading.",
            )
        } else if items.isEmpty {
            Text("Nothing captured.")
                .font(WriterTypography.body)
                .foregroundStyle(WriterColors.ink3)
                .lineSpacing(7.2)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(items) { item in
                    QuietRow(
                        state: item.state,
                        stateLabel: item.stateLabel,
                        title: item.title,
                        body: item.body,
                    )
                    .contentShape(Rectangle())
                    .onTapGesture { onTapItem(item.id) }
                }
            }
        }
    }
}

struct CapturedSurfaceItem: Identifiable, Equatable {
    let id: UUID
    let state: WriterState
    let stateLabel: String
    let title: String
    let body: String
    let sourceLabel: String
    let quote: String
    let context: String
    let proposedProjectTitle: String?
}

// MARK: - Stateful container

@MainActor
struct InboxView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var inboxStore: InboxStore

    @State private var draft = ""
    @State private var projects: [Project] = []
    @State private var isSubmitting = false
    @State private var isConfirming = false
    @State private var isLoadingProjects = false
    @State private var showCompose = false
    @State private var selectedItem: InboxItem?
    @State private var errorMessage: String?

    // Pending items live in the shared InboxStore so the Today "Captured" count
    // reflects filings/deposits the moment they happen here.
    private var pendingItems: [InboxItem] { inboxStore.pendingItems }
    private var isLoading: Bool { inboxStore.isLoading || isLoadingProjects }

    var body: some View {
        CapturedSurface(
            items: pendingItems.map(surfaceItem(for:)),
            isLoading: isLoading,
            scrollable: true,
            onTapItem: selectItem,
            onTapNewCapture: { showCompose = true },
        )
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showCompose) {
            CapturedComposeSheet(
                text: $draft,
                isSubmitting: isSubmitting,
                onSubmit: submitDump,
                onCancel: { showCompose = false },
            )
        }
        .sheet(item: $selectedItem) { item in
            CapturedDetailSheet(
                item: surfaceItem(for: item),
                canConfirm: item.proposedProjectId != nil,
                isConfirming: isConfirming,
                onConfirm: {
                    guard let projectId = item.proposedProjectId else { return }
                    await confirm(item, projectId: projectId)
                },
                onDismiss: { selectedItem = nil },
            )
        }
        .alert("Inbox error", isPresented: errorPresented) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var errorPresented: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } },
        )
    }

    private func selectItem(_ id: UUID) {
        selectedItem = pendingItems.first { $0.id == id }
    }

    private func surfaceItem(for item: InboxItem) -> CapturedSurfaceItem {
        let preview = (item.contentPreview ?? item.rawContentRef).capturedCleaned
        let state = writerState(for: item)
        let stateLabel = label(for: state)

        return CapturedSurfaceItem(
            id: item.id,
            state: state,
            stateLabel: stateLabel,
            title: preview.capturedTitle,
            body: preview.capturedSentence,
            sourceLabel: sourceLabel(for: item),
            quote: preview.isEmpty ? "No preview available." : preview,
            context: contextLine(for: item),
            proposedProjectTitle: item.proposedProjectId.map { projectTitle(for: $0) },
        )
    }

    private func writerState(for item: InboxItem) -> WriterState {
        let decisionKind = item.decision?.kind.lowercased() ?? ""
        let status = item.status.lowercased()
        let contentType = item.contentType.lowercased()

        if decisionKind.contains("question") || status.contains("question") {
            return .open
        }
        if status.contains("triaged") || item.triagedAt != nil {
            return .ready
        }
        if ["text", "url", "audio"].contains(contentType) {
            return .source
        }
        return .source
    }

    private func label(for state: WriterState) -> String {
        switch state {
        case .ready:
            return "Triaged"
        case .open:
            return "Open"
        default:
            return "Captured"
        }
    }

    private func sourceLabel(for item: InboxItem) -> String {
        let kind = item.contentType.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !kind.isEmpty else { return "Captured" }
        return "Captured \(kind.capitalized)"
    }

    private func contextLine(for item: InboxItem) -> String {
        if let projectId = item.proposedProjectId {
            return "Proposed for \(projectTitle(for: projectId))."
        }
        if let reasoning = item.agentReasoning?.capturedCleaned, !reasoning.isEmpty {
            return reasoning.capturedSentence
        }
        return "Captured from \(item.captureSurface)."
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
            showCompose = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func confirm(_ item: InboxItem, projectId: UUID) async {
        guard let config = configStore.config else { return }
        isConfirming = true
        defer { isConfirming = false }

        do {
            try await inboxStore.confirm(config: config, item: item, projectId: projectId)
            selectedItem = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Detail and compose surfaces

private struct CapturedDetailSheet: View {
    let item: CapturedSurfaceItem
    let canConfirm: Bool
    let isConfirming: Bool
    let onConfirm: () async -> Void
    let onDismiss: () -> Void

    @State private var showActions = false

    var body: some View {
        PageShell(pageMark: "Captured") {
            VStack(alignment: .leading, spacing: WriterSpacing.space5) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: WriterSpacing.space2) {
                        StateLabel(item.stateLabel, state: item.state)

                        Text("Captured")
                            .font(WriterTypography.sectionHeading)
                            .foregroundStyle(WriterColors.ink)
                            .lineSpacing(0.84)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: WriterSpacing.space3)

                    Button { showActions = true } label: {
                        Text("…")
                            .font(WriterTypography.metadata)
                            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                            .foregroundStyle(WriterColors.ink)
                            .frame(width: 38, height: 38)
                            .overlay {
                                Rectangle()
                                    .stroke(WriterColors.hairline, lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Captured actions")
                }

                SourceNote(
                    sourceLabel: item.sourceLabel,
                    quote: item.quote,
                    context: item.context,
                )

                Button(action: onDismiss) {
                    VStack(spacing: 0) {
                        Hairline(.hairline)

                        Text("CLOSE")
                            .font(WriterTypography.metadata)
                            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                            .foregroundStyle(WriterColors.ink)
                            .frame(maxWidth: .infinity, minHeight: 48)

                        Hairline(.hairline)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showActions) {
            CapturedOverflowSheet(
                proposedProjectTitle: item.proposedProjectTitle,
                canConfirm: canConfirm,
                isConfirming: isConfirming,
                onConfirm: {
                    await onConfirm()
                    showActions = false
                },
                onCancel: { showActions = false },
            )
        }
    }
}

private struct CapturedOverflowSheet: View {
    let proposedProjectTitle: String?
    let canConfirm: Bool
    let isConfirming: Bool
    let onConfirm: () async -> Void
    let onCancel: () -> Void

    var body: some View {
        PageShell(pageMark: "Actions") {
            VStack(alignment: .leading, spacing: WriterSpacing.space5) {
                StateLabel("Actions")

                Text("Actions")
                    .font(WriterTypography.sectionHeading)
                    .foregroundStyle(WriterColors.ink)
                    .lineSpacing(0.84)
                    .fixedSize(horizontal: false, vertical: true)

                SourceNote(
                    sourceLabel: "Destination",
                    quote: proposedProjectTitle ?? "No project proposed.",
                    context: canConfirm
                        ? "File this capture to the proposed project."
                        : "Triage has not proposed a project yet.",
                )

                Button {
                    Task { await onConfirm() }
                } label: {
                    VStack(spacing: 0) {
                        Hairline(.ink)

                        Text(isConfirming ? "FILING" : "FILE")
                            .font(WriterTypography.metadata)
                            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                            .foregroundStyle(canConfirm ? WriterColors.ink : WriterColors.ink3)
                            .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)

                        Hairline(.ink)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!canConfirm || isConfirming)

                Button(action: onCancel) {
                    Text("CANCEL")
                        .font(WriterTypography.metadata)
                        .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                        .foregroundStyle(WriterColors.ink3)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct CapturedComposeSheet: View {
    @Binding var text: String
    let isSubmitting: Bool
    let onSubmit: () async -> Void
    let onCancel: () -> Void

    private var submitDisabled: Bool {
        isSubmitting || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        PageShell(pageMark: "Capture") {
            VStack(alignment: .leading, spacing: WriterSpacing.space5) {
                StateLabel("New")

                Text("New capture")
                    .font(WriterTypography.sectionHeading)
                    .foregroundStyle(WriterColors.ink)
                    .lineSpacing(0.84)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: WriterSpacing.space2) {
                    Hairline(.hairline)

                    TextEditor(text: $text)
                        .font(WriterTypography.body)
                        .foregroundStyle(WriterColors.ink)
                        .lineSpacing(7.2)
                        .scrollContentBackground(.hidden)
                        .background(WriterColors.page)
                        .frame(minHeight: 180, alignment: .topLeading)
                        .textInputAutocapitalization(.sentences)

                    Hairline(.hairline)
                }

                Button {
                    Task { await onSubmit() }
                } label: {
                    VStack(spacing: 0) {
                        Hairline(.ink)

                        Text(isSubmitting ? "CAPTURING" : "CAPTURE")
                            .font(WriterTypography.metadata)
                            .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                            .foregroundStyle(submitDisabled ? WriterColors.ink3 : WriterColors.ink)
                            .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)

                        Hairline(.ink)
                    }
                }
                .buttonStyle(.plain)
                .disabled(submitDisabled)

                Button(action: onCancel) {
                    Text("CANCEL")
                        .font(WriterTypography.metadata)
                        .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                        .foregroundStyle(WriterColors.ink3)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
            }
        }
    }
}

// MARK: - Content shaping

private extension String {
    var capturedCleaned: String {
        components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    var capturedTitle: String {
        let words = capturedWords
        guard !words.isEmpty else { return "Untitled capture" }
        return words.prefix(5).joined(separator: " ")
    }

    var capturedSentence: String {
        let cleaned = capturedCleaned
        guard !cleaned.isEmpty else { return "No preview available." }

        if let end = cleaned.firstIndex(where: { ".!?".contains($0) }) {
            return String(cleaned[...end])
        }

        let words = cleaned.capturedWords
        guard words.count > 22 else { return cleaned }
        return words.prefix(22).joined(separator: " ") + "."
    }

    private var capturedWords: [String] {
        capturedCleaned.split(separator: " ").map(String.init)
    }
}
