import Foundation

@MainActor
final class SettingsStore: ObservableObject {
    @Published private(set) var settings: Settings?
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published var errorMessage: String?
    @Published private(set) var lastSavedAt: Date?

    func load(config: AppConfig) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let client = APIClient(config: config)
            settings = try await client.getSettings()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clear() {
        settings = nil
        errorMessage = nil
        lastSavedAt = nil
    }

    func update(config: AppConfig, patch: SettingsPatch) async {
        let previous = settings
        settings = (settings ?? .defaults).applying(patch)
        isSaving = true
        defer { isSaving = false }

        do {
            let client = APIClient(config: config)
            settings = try await client.updateSettings(patch: patch)
            lastSavedAt = Date()
            errorMessage = nil
        } catch {
            settings = previous
            errorMessage = error.localizedDescription
        }
    }
}
