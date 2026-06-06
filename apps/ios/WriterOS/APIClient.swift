import Foundation

enum APIError: Error, LocalizedError {
    case invalidResponse
    case unauthorized
    case badRequest(String)
    case server(Int, String)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Server returned an invalid response."
        case .unauthorized: return "Unauthorized. Check the API secret."
        case .badRequest(let message): return message
        case .server(let status, let message): return "Server error (\(status)): \(message)"
        case .transport(let error): return error.localizedDescription
        }
    }
}

actor APIClient {
    private let config: AppConfig
    private let session: URLSession

    init(config: AppConfig, session: URLSession = .shared) {
        self.config = config
        self.session = session
    }

    func listProjects() async throws -> [Project] {
        let request = makeRequest(path: "/projects", method: "GET")
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode([Project].self, from: data)
    }

    func createProject(title: String, type: String?) async throws -> Project {
        var request = makeRequest(path: "/projects", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = CreateProjectRequest(title: title, type: type)
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 201, data: data)
        return try JSONDecoder().decode(Project.self, from: data)
    }

    func getTrueLine(projectId: String) async throws -> TrueLineDocument {
        let request = makeRequest(path: "/projects/\(projectId)/trueline", method: "GET")
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode(TrueLineDocument.self, from: data)
    }

    func createSession(projectId: UUID, targetArticleId: UUID? = nil) async throws -> Session {
        var request = makeRequest(path: "/projects/\(projectId.uuidString)/sessions", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = CreateSessionRequest(targetArticleId: targetArticleId)
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 201, data: data)
        return try JSONDecoder().decode(Session.self, from: data)
    }

    @available(*, deprecated, message: "Use streamTurn(sessionId:message:) for SSE turn streaming.")
    func sendTurn(sessionId: UUID, message: String) async throws -> TurnResponse {
        var request = makeRequest(path: "/sessions/\(sessionId.uuidString)/turn", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = SendTurnRequest(message: message)
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode(TurnResponse.self, from: data)
    }

    func streamTurn(sessionId: UUID, message: String) throws -> SSEStreamConsumer {
        var request = makeRequest(path: "/sessions/\(sessionId.uuidString)/turn", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let body = SendTurnRequest(message: message)
        request.httpBody = try JSONEncoder().encode(body)
        return SSEStreamConsumer(request: request, session: session)
    }

    func endSession(sessionId: UUID) async throws -> Session {
        var request = makeRequest(path: "/sessions/\(sessionId.uuidString)/end", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "{}".data(using: .utf8)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode(Session.self, from: data)
    }

    func depositInbox(content: String, surface: String) async throws -> InboxDepositResponse {
        var request = makeRequest(path: "/inbox", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = DepositInboxRequest(rawContent: TextRawContent(body: content), captureSurface: surface)
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 201, data: data)
        return try JSONDecoder().decode(InboxDepositResponse.self, from: data)
    }

    func listPendingInbox() async throws -> [InboxItem] {
        let request = makeRequest(path: "/inbox/pending", method: "GET")
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode([InboxItem].self, from: data)
    }

    func confirmInboxItem(_ itemId: UUID, projectId: UUID) async throws -> InboxItem {
        var request = makeRequest(path: "/inbox/\(itemId.uuidString)/confirm", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ConfirmInboxRequest(projectId: projectId))
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode(InboxItem.self, from: data)
    }

    func getSettings() async throws -> Settings {
        let request = makeRequest(path: "/settings", method: "GET")
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode(Settings.self, from: data)
    }

    func updateSettings(patch: SettingsPatch) async throws -> Settings {
        var request = makeRequest(path: "/settings", method: "PATCH")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(patch)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
        return try JSONDecoder().decode(Settings.self, from: data)
    }

    func health() async throws {
        let url = config.apiBaseURL.appendingPathComponent("/health")
        let request = URLRequest(url: url)
        let (data, response) = try await perform(request)
        try Self.assertStatus(response, expected: 200, data: data)
    }

    private func makeRequest(path: String, method: String) -> URLRequest {
        var url = config.apiBaseURL
        url.append(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(config.apiSecret)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }
    }

    private static func assertStatus(_ response: URLResponse, expected: Int, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == expected { return }
        if http.statusCode == 401 { throw APIError.unauthorized }
        let message = decodeErrorMessage(from: data)
        if http.statusCode == 400 { throw APIError.badRequest(message) }
        throw APIError.server(http.statusCode, message)
    }

    private static func decodeErrorMessage(from data: Data) -> String {
        struct ErrorBody: Decodable { let error: String }
        if let body = try? JSONDecoder().decode(ErrorBody.self, from: data) {
            return body.error
        }
        return String(data: data, encoding: .utf8) ?? "<no body>"
    }
}

private struct CreateSessionRequest: Codable {
    let targetArticleId: UUID?
}

private struct SendTurnRequest: Codable {
    let message: String
}
