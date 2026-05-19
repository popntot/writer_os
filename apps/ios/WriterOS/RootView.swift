import SwiftUI

struct RootView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var settingsStore: SettingsStore

    var body: some View {
        if configStore.config == nil {
            ConfigSetupView()
        } else {
            TabView {
                ProjectsView()
                    .tabItem {
                        Label("Projects", systemImage: "folder")
                    }
                InboxView()
                    .tabItem {
                        Label("Dump", systemImage: "tray.and.arrow.down")
                    }
                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape")
                    }
            }
            .task(id: configStore.config) {
                if let config = configStore.config {
                    await settingsStore.load(config: config)
                } else {
                    settingsStore.clear()
                }
            }
        }
    }
}
