import SwiftUI

struct RootView: View {
    @EnvironmentObject private var configStore: AppConfigStore

    var body: some View {
        if configStore.config == nil {
            ConfigSetupView()
        } else {
            ProjectsView()
        }
    }
}
