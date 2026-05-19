import SwiftUI

@main
struct WriterOSApp: App {
    @StateObject private var configStore = AppConfigStore()
    @StateObject private var settingsStore = SettingsStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(configStore)
                .environmentObject(settingsStore)
        }
    }
}
