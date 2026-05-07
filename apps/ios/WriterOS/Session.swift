import Foundation

struct Session: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let projectId: UUID
    let targetArticleId: UUID?
    let startAt: Date
    let endAt: Date?
    let audioRef: String?
    let transcriptRef: String?
    let consolidationStatus: String
    let summary: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case projectId
        case targetArticleId
        case startAt
        case endAt
        case audioRef
        case transcriptRef
        case consolidationStatus
        case summary
    }

    init(
        id: UUID,
        projectId: UUID,
        targetArticleId: UUID?,
        startAt: Date,
        endAt: Date?,
        audioRef: String?,
        transcriptRef: String?,
        consolidationStatus: String,
        summary: String?
    ) {
        self.id = id
        self.projectId = projectId
        self.targetArticleId = targetArticleId
        self.startAt = startAt
        self.endAt = endAt
        self.audioRef = audioRef
        self.transcriptRef = transcriptRef
        self.consolidationStatus = consolidationStatus
        self.summary = summary
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        projectId = try container.decode(UUID.self, forKey: .projectId)
        targetArticleId = try container.decodeIfPresent(UUID.self, forKey: .targetArticleId)
        startAt = try container.decodeFractionalISO8601Date(forKey: .startAt)
        endAt = try container.decodeFractionalISO8601DateIfPresent(forKey: .endAt)
        audioRef = try container.decodeIfPresent(String.self, forKey: .audioRef)
        transcriptRef = try container.decodeIfPresent(String.self, forKey: .transcriptRef)
        consolidationStatus = try container.decode(String.self, forKey: .consolidationStatus)
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(projectId, forKey: .projectId)
        try container.encodeIfPresent(targetArticleId, forKey: .targetArticleId)
        try container.encode(ISO8601FractionalSeconds.string(from: startAt), forKey: .startAt)
        if let endAt {
            try container.encode(ISO8601FractionalSeconds.string(from: endAt), forKey: .endAt)
        } else {
            try container.encodeNil(forKey: .endAt)
        }
        try container.encodeIfPresent(audioRef, forKey: .audioRef)
        try container.encodeIfPresent(transcriptRef, forKey: .transcriptRef)
        try container.encode(consolidationStatus, forKey: .consolidationStatus)
        try container.encodeIfPresent(summary, forKey: .summary)
    }
}

struct TurnResponse: Codable, Sendable {
    let text: String
    let usage: TurnUsage
}

struct TurnUsage: Codable, Sendable {
    let inputTokens: Int
    let outputTokens: Int
    let costUsd: Double
}

enum ISO8601FractionalSeconds {
    private static func makeFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }

    static func date(from string: String) -> Date? {
        makeFormatter().date(from: string)
    }

    static func string(from date: Date) -> String {
        makeFormatter().string(from: date)
    }
}

private extension KeyedDecodingContainer {
    func decodeFractionalISO8601Date(forKey key: Key) throws -> Date {
        let string = try decode(String.self, forKey: key)
        if let date = ISO8601FractionalSeconds.date(from: string) {
            return date
        }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: self,
            debugDescription: "Expected an ISO8601 date with fractional seconds",
        )
    }

    func decodeFractionalISO8601DateIfPresent(forKey key: Key) throws -> Date? {
        guard let string = try decodeIfPresent(String.self, forKey: key) else {
            return nil
        }
        if let date = ISO8601FractionalSeconds.date(from: string) {
            return date
        }
        throw DecodingError.dataCorruptedError(
            forKey: key,
            in: self,
            debugDescription: "Expected an ISO8601 date with fractional seconds",
        )
    }
}
