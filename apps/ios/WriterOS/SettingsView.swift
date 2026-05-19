import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var settingsStore: SettingsStore

    var body: some View {
        NavigationStack {
            Form {
                if settingsStore.isLoading && settingsStore.settings == nil {
                    ProgressView()
                } else {
                    Section {
                        Toggle(
                            "Audio capture default",
                            isOn: boolBinding(\.audioCaptureDefault) { value in
                                SettingsPatch(audioCaptureDefault: value)
                            }
                        )

                        Stepper(
                            value: intBinding(\.audioRetentionHotDays) { value in
                                SettingsPatch(audioRetentionHotDays: value)
                            },
                            in: 0...currentSettings.audioRetentionColdDays
                        ) {
                            LabeledContent("Audio retention - hot (days)") {
                                Text("\(currentSettings.audioRetentionHotDays)")
                            }
                        }

                        Stepper(
                            value: intBinding(\.audioRetentionColdDays) { value in
                                SettingsPatch(audioRetentionColdDays: value)
                            },
                            in: currentSettings.audioRetentionHotDays...10_000
                        ) {
                            LabeledContent("Audio retention - cold (days)") {
                                Text("\(currentSettings.audioRetentionColdDays)")
                            }
                        }

                        Toggle(
                            "Location tagging default",
                            isOn: boolBinding(\.locationTagDefault) { value in
                                SettingsPatch(locationTagDefault: value)
                            }
                        )
                    }

                    Section {
                        HStack {
                            Spacer()
                            if settingsStore.isSaving {
                                Text("Saving...")
                                    .foregroundStyle(.secondary)
                            } else if settingsStore.lastSavedAt != nil {
                                Text("Saved")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .task {
                guard let config = configStore.config else { return }
                await settingsStore.load(config: config)
            }
            .alert(
                "Settings error",
                isPresented: Binding(
                    get: { settingsStore.errorMessage != nil },
                    set: { if !$0 { settingsStore.errorMessage = nil } },
                ),
            ) {
                Button("OK", role: .cancel) { settingsStore.errorMessage = nil }
            } message: {
                Text(settingsStore.errorMessage ?? "")
            }
        }
    }

    private var currentSettings: Settings {
        settingsStore.settings ?? .defaults
    }

    private func boolBinding(
        _ keyPath: WritableKeyPath<Settings, Bool>,
        patch: @escaping (Bool) -> SettingsPatch
    ) -> Binding<Bool> {
        Binding(
            get: { currentSettings[keyPath: keyPath] },
            set: { value in
                save(patch(value))
            }
        )
    }

    private func intBinding(
        _ keyPath: WritableKeyPath<Settings, Int>,
        patch: @escaping (Int) -> SettingsPatch
    ) -> Binding<Int> {
        Binding(
            get: { currentSettings[keyPath: keyPath] },
            set: { value in
                save(patch(value))
            }
        )
    }

    private func save(_ patch: SettingsPatch) {
        guard let config = configStore.config else { return }
        Task {
            await settingsStore.update(config: config, patch: patch)
        }
    }
}
