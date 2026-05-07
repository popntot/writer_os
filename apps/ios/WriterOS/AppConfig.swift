import Foundation

struct AppConfig: Codable, Equatable {
    var apiBaseURL: URL
    var apiSecret: String
}

@MainActor
final class AppConfigStore: ObservableObject {
    private static let storageKey = "writeros.appconfig.v1"

    @Published private(set) var config: AppConfig?

    init() {
        self.config = Self.load()
    }

    func save(_ config: AppConfig) {
        self.config = config
        Self.persist(config)
    }

    func clear() {
        self.config = nil
        UserDefaults.standard.removeObject(forKey: Self.storageKey)
    }

    private static func load() -> AppConfig? {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            return nil
        }
        return try? JSONDecoder().decode(AppConfig.self, from: data)
    }

    private static func persist(_ config: AppConfig) {
        guard let data = try? JSONEncoder().encode(config) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
