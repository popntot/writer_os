import SwiftUI

struct ConfigSetupView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @State private var apiURLString: String = "http://"
    @State private var apiSecret: String = ""
    @State private var validationError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("API base URL", text: $apiURLString)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("API secret", text: $apiSecret)
                } header: {
                    Text("Connect to backend")
                } footer: {
                    Text("Point at your local Cloudflare Worker (e.g. http://192.168.1.10:8787) or a deployed Worker. The secret is the value of WRITER_OS_API_SECRET in apps/api/.dev.vars.")
                }

                if let validationError {
                    Section {
                        Text(validationError)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button("Save and continue", action: save)
                        .disabled(apiURLString.isEmpty || apiSecret.isEmpty)
                }
            }
            .navigationTitle("Setup")
        }
    }

    private func save() {
        guard let url = URL(string: apiURLString.trimmingCharacters(in: .whitespaces)),
              url.scheme != nil, url.host != nil else {
            validationError = "Enter a valid URL including http:// or https://"
            return
        }
        validationError = nil
        configStore.save(AppConfig(apiBaseURL: url, apiSecret: apiSecret))
    }
}
