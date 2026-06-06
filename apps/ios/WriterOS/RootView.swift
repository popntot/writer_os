import SwiftUI

struct RootView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var settingsStore: SettingsStore
    @EnvironmentObject private var inboxStore: InboxStore

    var body: some View {
        if configStore.config == nil {
            ConfigSetupView()
        } else {
            // The bottom tab shell stays from DS-1; rewiring the six-tab DS
            // BottomNav (Today/Walk/Close/Article/Source/System) is DS-4+ work.
            // DS-3 reskins the Today + Walk surfaces inside this shell.
            TabView {
                TodayView()
                    .tabItem {
                        Label("Today", systemImage: "doc.text")
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
                    await inboxStore.reload(config: config)
                } else {
                    settingsStore.clear()
                    inboxStore.clear()
                }
            }
        }
    }
}
