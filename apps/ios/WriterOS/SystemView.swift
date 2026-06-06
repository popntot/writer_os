import SwiftUI

enum SystemSurfaceMode: Equatable {
    case full
    case identitySetup
}

struct SystemSurface: View {
    let mode: SystemSurfaceMode
    let settings: Settings
    let isLoadingSettings: Bool
    let isSavingSettings: Bool
    let hasSavedSettings: Bool
    @Binding var apiURLString: String
    @Binding var apiSecret: String
    let validationError: String?
    let projectTitle: String?
    let trueLine: TrueLineDocument?
    let spineMessage: String?

    // The live screen scrolls the full column; snapshots render the plain
    // column (a ScrollView renders empty under the test harness's drawHierarchy).
    var scrollable: Bool = false

    var onSaveConfig: () -> Void = {}
    var onUpdateAudioCaptureDefault: (Bool) -> Void = { _ in }
    var onUpdateAudioRetentionHotDays: (Int) -> Void = { _ in }
    var onUpdateAudioRetentionColdDays: (Int) -> Void = { _ in }
    var onUpdateLocationTagDefault: (Bool) -> Void = { _ in }

    var body: some View {
        PageShell(pageMark: "System") {
            Group {
                if mode == .identitySetup {
                    setupColumn
                } else if scrollable {
                    ScrollView {
                        fullColumn
                    }
                } else {
                    fullColumn
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var setupColumn: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space5) {
            StateLabel("Setup")

            Text("System")
                .font(WriterTypography.pageTitle)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)

            identitySection
        }
    }

    private var fullColumn: some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space5) {
            StateLabel("System")

            Text("System")
                .font(WriterTypography.pageTitle)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)

            audioSection
            identitySection
            spineSection
            restraintSection
        }
        .padding(.bottom, WriterSpacing.space7)
    }

    private var audioSection: some View {
        systemSection("Audio") {
            if isLoadingSettings {
                SystemSpecRow(
                    label: "Store",
                    title: "Audio settings",
                    body: "Reading the current capture defaults.",
                    value: "Wait",
                )
            }

            SystemSpecRow(
                label: "Default",
                title: "Audio capture",
                body: "Use audio capture when a walk begins.",
                value: settings.audioCaptureDefault ? "On" : "Off",
            ) {
                Toggle("", isOn: Binding(
                    get: { settings.audioCaptureDefault },
                    set: onUpdateAudioCaptureDefault,
                ))
                .labelsHidden()
            }

            SystemSpecRow(
                label: "Hot",
                title: "Audio retention",
                body: "Keep recent audio in hot storage for this many days.",
                value: "\(settings.audioRetentionHotDays)d",
            ) {
                stepControls(
                    decrementDisabled: settings.audioRetentionHotDays <= 0,
                    incrementDisabled: settings.audioRetentionHotDays >= settings.audioRetentionColdDays,
                    onDecrement: {
                        onUpdateAudioRetentionHotDays(max(0, settings.audioRetentionHotDays - 1))
                    },
                    onIncrement: {
                        onUpdateAudioRetentionHotDays(
                            min(settings.audioRetentionColdDays, settings.audioRetentionHotDays + 1)
                        )
                    },
                )
            }

            SystemSpecRow(
                label: "Cold",
                title: "Cold retention",
                body: "Keep archived audio in cold storage for this many days.",
                value: "\(settings.audioRetentionColdDays)d",
            ) {
                stepControls(
                    decrementDisabled: settings.audioRetentionColdDays <= settings.audioRetentionHotDays,
                    incrementDisabled: settings.audioRetentionColdDays >= 10_000,
                    onDecrement: {
                        onUpdateAudioRetentionColdDays(
                            max(settings.audioRetentionHotDays, settings.audioRetentionColdDays - 1)
                        )
                    },
                    onIncrement: {
                        onUpdateAudioRetentionColdDays(min(10_000, settings.audioRetentionColdDays + 1))
                    },
                )
            }

            SystemSpecRow(
                label: "Place",
                title: "Location tagging",
                body: "Attach location context to new captures by default.",
                value: settings.locationTagDefault ? "On" : "Off",
            ) {
                Toggle("", isOn: Binding(
                    get: { settings.locationTagDefault },
                    set: onUpdateLocationTagDefault,
                ))
                .labelsHidden()
            }

            SystemSpecRow(
                label: "Write",
                title: "Settings store",
                body: "Changes use the existing settings endpoint.",
                value: settingsStatus,
            )
        }
    }

    private var identitySection: some View {
        systemSection("Identity") {
            SystemSpecRow(
                label: "URL",
                title: "API base URL",
                body: "Point at the local or deployed Worker.",
            ) {
                TextField("http://", text: $apiURLString)
                    .font(WriterTypography.mono(size: 10, weight: .medium))
                    .foregroundStyle(WriterColors.ink)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .textFieldStyle(.plain)
                    .frame(width: 128, alignment: .trailing)
            }

            SystemSpecRow(
                label: "Secret",
                title: "API secret",
                body: "Use the value of WRITER_OS_API_SECRET.",
            ) {
                SecureField("secret", text: $apiSecret)
                    .font(WriterTypography.mono(size: 10, weight: .medium))
                    .foregroundStyle(WriterColors.ink)
                    .textInputAutocapitalization(.never)
                    .textFieldStyle(.plain)
                    .frame(width: 128, alignment: .trailing)
            }

            if let validationError {
                SystemSpecRow(
                    label: "Open",
                    title: "Identity needs a URL",
                    body: validationError,
                    value: "Open",
                )
            }

            Button(action: onSaveConfig) {
                VStack(spacing: 0) {
                    Hairline(.ink)

                    Text("SAVE AND CONTINUE")
                        .font(WriterTypography.metadata)
                        .tracking(WriterTypography.tracking(em: 0.12, size: 9))
                        .foregroundStyle(identitySaveDisabled ? WriterColors.ink3 : WriterColors.ink)
                        .frame(maxWidth: .infinity, minHeight: WriterSpacing.bottomNavHeight)

                    Hairline(.ink)
                }
            }
            .buttonStyle(.plain)
            .disabled(identitySaveDisabled)
            .accessibilityLabel("Save and continue")
        }
    }

    private var spineSection: some View {
        systemSection("Spine") {
            SystemSpecRow(
                label: "Project",
                title: projectTitle ?? "No project",
                body: spineMessage ?? "Current project TrueLine.",
                value: trueLine.map { "v\($0.version)" } ?? "v0",
            )

            if let trueLine {
                SourceNote(
                    sourceLabel: "TrueLine v\(trueLine.version)",
                    quote: trueLine.content.isEmpty ? "No TrueLine yet." : trueLine.content,
                    context: trueLine.contributionSummary ?? "Current project spine.",
                )
            } else {
                SourceNote(
                    sourceLabel: "TrueLine v0",
                    quote: "No TrueLine yet.",
                    context: spineMessage ?? "Create a project, then the spine appears here.",
                )
            }
        }
    }

    private var restraintSection: some View {
        systemSection("Rules of restraint") {
            Text(Self.restraintRules)
                .font(WriterTypography.body)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(7.2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var settingsStatus: String {
        if isSavingSettings {
            return "Saving"
        }
        if hasSavedSettings {
            return "Saved"
        }
        return "Ready"
    }

    private var identitySaveDisabled: Bool {
        apiURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || apiSecret.isEmpty
    }

    private func systemSection<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: WriterSpacing.space4) {
            Hairline(.ink)

            Text(title)
                .font(WriterTypography.sectionHeading)
                .foregroundStyle(WriterColors.ink)
                .lineSpacing(0.84)
                .fixedSize(horizontal: false, vertical: true)

            content()
        }
    }

    private func stepControls(
        decrementDisabled: Bool,
        incrementDisabled: Bool,
        onDecrement: @escaping () -> Void,
        onIncrement: @escaping () -> Void
    ) -> some View {
        HStack(spacing: WriterSpacing.space2) {
            stepButton("-", disabled: decrementDisabled, action: onDecrement)
            stepButton("+", disabled: incrementDisabled, action: onIncrement)
        }
    }

    private func stepButton(
        _ label: String,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(WriterTypography.mono(size: 12, weight: .heavy))
                .foregroundStyle(disabled ? WriterColors.ink3 : WriterColors.ink)
                .frame(width: 28, height: 28)
                .overlay {
                    Rectangle()
                        .stroke(WriterColors.hairline, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    static let restraintRules = """
    Writer OS should feel like a composed editorial instrument, not a productivity dashboard, AI chat surface, or decorative notebook app.

    The interface should be:

    - Severe, quiet, almost invisible. The design gets its personality through restraint.
    - Reading-first. The primary unit is a composed page of thought, not a card, feed, chat bubble, or widget.
    - Editorial, not cozy. Use literary typography, hairline rules, and measured spacing rather than faux paper, handwriting, or nostalgic texture.
    - AI-invisible. The intelligence is implied by prioritization: what is shown, hidden, sequenced, and named.
    - Almost static. Motion should feel like a page settling, not a product performing.

    Anti-Patterns

    Do not make Writer OS feel like:

    - AI SaaS: glowing gradients, purple/blue sheen, assistant avatars, chat-first composition.
    - A project dashboard: KPIs, widget grids, dense management panels, task-board aesthetics.
    - A precious journal: faux handwriting, torn paper, stickers, heavy textures, sentimental notebook cues.
    - A generic mobile app: rounded card stacks, pill-heavy controls, overly familiar startup UI.
    """
}

@MainActor
struct SystemView: View {
    @EnvironmentObject private var configStore: AppConfigStore
    @EnvironmentObject private var settingsStore: SettingsStore

    private let mode: SystemSurfaceMode

    @State private var apiURLString = "http://"
    @State private var apiSecret = ""
    @State private var validationError: String?
    @State private var projectTitle: String?
    @State private var trueLine: TrueLineDocument?
    @State private var spineMessage: String?
    @State private var didSeedIdentity = false

    init(mode: SystemSurfaceMode = .full) {
        self.mode = mode
    }

    var body: some View {
        SystemSurface(
            mode: mode,
            settings: currentSettings,
            isLoadingSettings: settingsStore.isLoading,
            isSavingSettings: settingsStore.isSaving,
            hasSavedSettings: settingsStore.lastSavedAt != nil,
            apiURLString: $apiURLString,
            apiSecret: $apiSecret,
            validationError: validationError ?? settingsStore.errorMessage,
            projectTitle: projectTitle,
            trueLine: trueLine,
            spineMessage: spineMessage,
            scrollable: true,
            onSaveConfig: saveConfig,
            onUpdateAudioCaptureDefault: { value in
                save(SettingsPatch(audioCaptureDefault: value))
            },
            onUpdateAudioRetentionHotDays: { value in
                save(SettingsPatch(audioRetentionHotDays: value))
            },
            onUpdateAudioRetentionColdDays: { value in
                save(SettingsPatch(audioRetentionColdDays: value))
            },
            onUpdateLocationTagDefault: { value in
                save(SettingsPatch(locationTagDefault: value))
            },
        )
        .task(id: configTaskId) {
            seedIdentityIfNeeded()
            await load()
        }
    }

    private var currentSettings: Settings {
        settingsStore.settings ?? .defaults
    }

    private var configTaskId: String {
        configStore.config?.apiBaseURL.absoluteString ?? "no-config"
    }

    private func seedIdentityIfNeeded() {
        guard !didSeedIdentity, let config = configStore.config else { return }
        apiURLString = config.apiBaseURL.absoluteString
        apiSecret = config.apiSecret
        didSeedIdentity = true
    }

    private func load() async {
        guard mode == .full, let config = configStore.config else { return }
        await settingsStore.load(config: config)
        await loadSpine(config: config)
    }

    private func loadSpine(config: AppConfig) async {
        let client = APIClient(config: config)

        do {
            let projects = try await client.listProjects()
            guard let project = projects.first else {
                projectTitle = nil
                trueLine = nil
                spineMessage = "No project yet."
                return
            }

            projectTitle = project.title
            trueLine = try await client.getTrueLine(projectId: project.id)
            spineMessage = "Current project TrueLine."
        } catch {
            spineMessage = error.localizedDescription
        }
    }

    private func saveConfig() {
        guard let url = URL(string: apiURLString.trimmingCharacters(in: .whitespaces)),
              url.scheme != nil, url.host != nil else {
            validationError = "Enter a valid URL including http:// or https://"
            return
        }

        validationError = nil
        configStore.save(AppConfig(apiBaseURL: url, apiSecret: apiSecret))
    }

    private func save(_ patch: SettingsPatch) {
        guard let config = configStore.config else { return }
        Task {
            await settingsStore.update(config: config, patch: patch)
        }
    }
}
