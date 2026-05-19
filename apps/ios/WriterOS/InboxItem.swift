import Foundation

struct InboxItem: Identifiable, Codable, Equatable {
    let id: UUID
    let rawContentRef: String
    let contentType: String
    let captureSurface: String
    let status: String
    let decision: InboxDecision?
    let proposedProjectId: UUID?
    let resolvedProjectId: UUID?
    let sourceId: UUID?
    let agentReasoning: String?
    let depositedAt: String
    let triagedAt: String?
    let filedAt: String?
    let lastActionAt: String
    let contentPreview: String?
}

struct InboxDecision: Codable, Equatable {
    let kind: String
    let projectId: UUID?
    let sourceId: UUID?
    let confidence: Double?
    let reasoning: String
}

struct InboxDepositResponse: Codable, Equatable {
    let itemId: UUID
    let status: String
}

struct DepositInboxRequest: Codable, Equatable {
    let rawContent: TextRawContent
    let captureSurface: String
}

struct TextRawContent: Codable, Equatable {
    let type: String
    let body: String
    let suppliedTitle: String?

    init(body: String, suppliedTitle: String? = nil) {
        self.type = "text"
        self.body = body
        self.suppliedTitle = suppliedTitle
    }
}

struct ConfirmInboxRequest: Codable, Equatable {
    let projectId: UUID
}
