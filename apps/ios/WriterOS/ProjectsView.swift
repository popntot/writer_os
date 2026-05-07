import SwiftUI

@MainActor
struct ProjectsView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @State private var projects: [Project] = []
    @State private var loadState: LoadState = .idle
    @State private var showCreate = false

    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Projects")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Create project")
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Settings") {
                            configStore.clear()
                        }
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

    @ViewBuilder
    private var content: some View {
        switch loadState {
        case .idle, .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded:
            if projects.isEmpty {
                ContentUnavailableView(
                    "No projects yet",
                    systemImage: "tray",
                    description: Text("Tap + to create your first project."),
                )
            } else {
                List(projects) { project in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(project.title).font(.headline)
                        if let type = project.type, !type.isEmpty {
                            Text(type).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load projects", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Retry") { Task { await reload() } }
            }
        }
    }

    private func reload() async {
        guard let config = configStore.config else { return }
        loadState = .loading
        do {
            let client = APIClient(config: config)
            projects = try await client.listProjects()
            loadState = .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    private func create(title: String, type: String?) async {
        guard let config = configStore.config else { return }
        do {
            let client = APIClient(config: config)
            let project = try await client.createProject(title: title, type: type)
            projects.insert(project, at: 0)
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }
}
