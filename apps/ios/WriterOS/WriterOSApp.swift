import SwiftUI

@main
struct WriterOSApp: App {
    @StateObject private var configStore = AppConfigStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(configStore)
        }
    }
}
