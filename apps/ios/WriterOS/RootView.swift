import SwiftUI

struct RootView: View {
    @EnvironmentObject private var configStore: AppConfigStore

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
            }
        }
    }
}
