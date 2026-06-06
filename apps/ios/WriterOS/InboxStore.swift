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

    // Monotonic token so overlapping reloads (e.g. an initial load racing a
    // post-mutation refresh) never let a stale result win, while a refresh is
    // never silently dropped just because another is in flight.
    private var reloadSeq = 0

    var unreviewedCount: Int { pendingItems.count }
    var hasUnreviewed: Bool { !pendingItems.isEmpty }

    func reload(config: AppConfig) async {
        reloadSeq += 1
        let seq = reloadSeq
        isLoading = true

        do {
            let items = try await APIClient(config: config).listPendingInbox()
            guard seq == reloadSeq else { return }
            pendingItems = items
            errorMessage = nil
        } catch {
            guard seq == reloadSeq else { return }
            errorMessage = error.localizedDescription
        }
        if seq == reloadSeq { isLoading = false }
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
