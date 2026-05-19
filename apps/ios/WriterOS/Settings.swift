import Foundation

struct Settings: Codable, Equatable {
    let id: String
    var audioCaptureDefault: Bool
    var audioRetentionHotDays: Int
    var audioRetentionColdDays: Int
    var locationTagDefault: Bool
    let updatedAt: String

    static let defaults = Settings(
        id: "singleton",
        audioCaptureDefault: false,
        audioRetentionHotDays: 30,
        audioRetentionColdDays: 365,
        locationTagDefault: false,
        updatedAt: ""
    )

    func applying(_ patch: SettingsPatch) -> Settings {
        Settings(
            id: id,
            audioCaptureDefault: patch.audioCaptureDefault ?? audioCaptureDefault,
            audioRetentionHotDays: patch.audioRetentionHotDays ?? audioRetentionHotDays,
            audioRetentionColdDays: patch.audioRetentionColdDays ?? audioRetentionColdDays,
            locationTagDefault: patch.locationTagDefault ?? locationTagDefault,
            updatedAt: updatedAt
        )
    }
}

struct SettingsPatch: Codable, Equatable {
    var audioCaptureDefault: Bool?
    var audioRetentionHotDays: Int?
    var audioRetentionColdDays: Int?
    var locationTagDefault: Bool?

    init(
        audioCaptureDefault: Bool? = nil,
        audioRetentionHotDays: Int? = nil,
        audioRetentionColdDays: Int? = nil,
        locationTagDefault: Bool? = nil
    ) {
        self.audioCaptureDefault = audioCaptureDefault
        self.audioRetentionHotDays = audioRetentionHotDays
        self.audioRetentionColdDays = audioRetentionColdDays
        self.locationTagDefault = locationTagDefault
    }
}
