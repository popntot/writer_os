import SwiftUI

struct RootView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var settingsStore: SettingsStore
    @EnvironmentObject private var inboxStore: InboxStore

    var body: some View {
        if configStore.config == nil {
            ConfigSetupView()
        } else {
            TabView {
                TodayView()
                    .tabItem {
                        Text("Today")
                    }
                SystemView()
                    .tabItem {
                        Text("System")
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
