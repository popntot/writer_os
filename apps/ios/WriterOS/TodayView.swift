import SwiftUI

// MARK: - Routing

private enum TodayRoute: Hashable {
    case walk(UUID)
    case inbox
}

// MARK: - Pure surface (snapshot-testable)

/// The Today screen composed only from design-system primitives.
///
/// It takes plain data and callbacks so it renders deterministically with no
/// network or environment dependency — `TodayView` supplies live data, the
/// snapshot tests supply fixtures.
struct TodaySurface: View {
    let mode: WriterMode
    let dateText: String
    let title: String
    let projectItems: [WorkIndexItem]
    let walkQuestion: String
    let inboxCount: Int
    let hasUnreviewed: Bool

    /// The live screen scrolls so a long project list (plus the Captured /
    /// New-project rows) never clips. Snapshots render the non-scrolling column,
    /// which lays out identically for non-overflowing fixtures and, unlike a
    /// ScrollView, renders under the test harness's `drawHierarchy`.
    var scrollable: Bool = false

    var onSelectMode: (WriterMode) -> Void = { _ in }
    var onTapInbox: () -> Void = {}
    var onTapNewProject: () -> Void = {}
    var onBeginWalk: () -> Void = {}

    var body: some View {
        PageShell(pageMark: "Today") {
            if scrollable {
                ScrollView { column }
            } else {
                column
            }
        }
    }

    private var column: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space4) {
            StateLabel(dateText)

            ModeSwitch(selectedMode: mode, onSelect: onSelectMode)

            Text(title)
                .font(WriterTypography.pageTitle)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            switch mode {
            case .walk:
                walkBody
            case .desk:
                deskBody
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var walkBody: some View {
        PrimaryQuestion(walkQuestion)
            .contentShape(Rectangle())
            .onTapGesture(perform: onBeginWalk)

        if projectItems.isEmpty {
            QuietRow(
                state: .inactive,
                stateLabel: "New",
                title: "New project",
                body: "Start a fresh project.",
            )
            .contentShape(Rectangle())
            .onTapGesture(perform: onTapNewProject)
        }
    }

    @ViewBuilder
    private var deskBody: some View {
        WorkIndex(items: projectItems)

        QuietRow(
            state: hasUnreviewed ? .active : .inactive,
            stateLabel: "Captured",
            title: "\(inboxCount) captured",
            body: "Review when settled.",
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTapInbox)

        QuietRow(
            state: .inactive,
            stateLabel: "New",
            title: "New project",
            body: "Start a fresh project.",
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTapNewProject)
    }
}

// MARK: - Stateful container

@MainActor
struct TodayView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var inboxStore: InboxStore

    @State private var projects: [Project] = []
    @State private var path = NavigationPath()
    @State private var showCreate = false
    @SceneStorage("today.mode") private var modeRaw: String = WriterMode.desk.rawValue

    private var mode: WriterMode { WriterMode(rawValue: modeRaw) ?? .desk }

    var body: some View {
        NavigationStack(path: $path) {
            TodaySurface(
                mode: mode,
                dateText: Self.dateText(),
                title: titleText,
                projectItems: projectItems,
                walkQuestion: walkQuestion,
                inboxCount: inboxStore.unreviewedCount,
                hasUnreviewed: inboxStore.hasUnreviewed,
                scrollable: true,
                onSelectMode: { modeRaw = $0.rawValue },
                onTapInbox: { path.append(TodayRoute.inbox) },
                onTapNewProject: { showCreate = true },
                onBeginWalk: beginCurrentWalk,
            )
            .navigationDestination(for: TodayRoute.self) { route in
                switch route {
                case .walk(let projectId):
                    ChatView(projectId: projectId)
                case .inbox:
                    InboxView()
                }
            }
            .sheet(isPresented: $showCreate) {
                CreateProjectSheet { title, type in
                    await create(title: title, type: type)
                }
            }
            .task { await reload() }
            .refreshable { await reload() }
        }
    }

    // MARK: Derived view data

    /// Projects render as a Desk reading order. Each row is a quiet navigation
    /// target into that project's Walk session (still a reading order, never a
    /// checklist — see WorkIndexItem.onSelect).
    private var projectItems: [WorkIndexItem] {
        projects.map { project in
            let destination = UUID(uuidString: project.id).map { id in
                { path.append(TodayRoute.walk(id)) }
            }
            return WorkIndexItem(
                id: project.id,
                text: project.title,
                state: .active,
                mark: "Walk",
                onSelect: destination,
            )
        }
    }

    private var titleText: String {
        switch mode {
        case .walk:
            return projects.first?.title ?? "Today"
        case .desk:
            return "Projects"
        }
    }

    /// The Walk-mode question is the current project's open question. The iOS
    /// OpenQuestions surface (#16) isn't wired yet, so this is the soft empty
    /// state until that lands.
    private var walkQuestion: String {
        "Nothing waiting. Begin."
    }

    private func beginCurrentWalk() {
        guard let first = projects.first, let id = UUID(uuidString: first.id) else { return }
        path.append(TodayRoute.walk(id))
    }

    private static func dateText() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM"
        return formatter.string(from: Date())
    }

    // MARK: Data

    // Today stays a calm surface: load failures fall back to the empty state
    // and recover on pull-to-refresh rather than raising error chrome.
    private func reload() async {
        guard let config = configStore.config else { return }
        let client = APIClient(config: config)
        if let loaded = try? await client.listProjects() {
            projects = loaded
        }
        await inboxStore.reload(config: config)
    }

    private func create(title: String, type: String?) async {
        guard let config = configStore.config else { return }
        let client = APIClient(config: config)
        if let project = try? await client.createProject(title: title, type: type) {
            projects.insert(project, at: 0)
        }
    }
}
