import Foundation

/// Shared source of truth for pending inbox items.
///
/// Both the Today surface (which shows the "Captured" count) and InboxView
/// (which lists and mutates pending items) read from this one store, so the
/// Today count updates live the moment InboxView files or deposits an item.
@MainActor
final class InboxStore: ObservableObject {
    @Published private(set) var pendingItems: [InboxItem] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    var unreviewedCount: Int { pendingItems.count }
    var hasUnreviewed: Bool { !pendingItems.isEmpty }

    func reload(config: AppConfig) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let client = APIClient(config: config)
            pendingItems = try await client.listPendingInbox()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deposit(config: AppConfig, content: String, surface: String) async throws {
        let client = APIClient(config: config)
        _ = try await client.depositInbox(content: content, surface: surface)
        await reload(config: config)
    }

    func confirm(config: AppConfig, item: InboxItem, projectId: UUID) async throws {
        let client = APIClient(config: config)
        _ = try await client.confirmInboxItem(item.id, projectId: projectId)
        await reload(config: config)
    }

    func clear() {
        pendingItems = []
        errorMessage = nil
    }
}
