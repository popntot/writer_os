import XCTest
@testable import WriterOS

final class APIClientSessionsTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    func testCreateSessionPostsProjectSessionsAndDecodesSession() async throws {
        let projectId = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let sessionId = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!

        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/projects/\(projectId.uuidString)/sessions")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-secret")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try XCTUnwrap(request.httpBodyJSON())
            XCTAssertNil(body["targetArticleId"])

            return StubResponse(
                statusCode: 201,
                body: """
                {
                  "id": "\(sessionId.uuidString.lowercased())",
                  "projectId": "\(projectId.uuidString.lowercased())",
                  "targetArticleId": null,
                  "startAt": "2026-05-07T12:00:00.000Z",
                  "endAt": null,
                  "audioRef": null,
                  "transcriptRef": null,
                  "consolidationStatus": "pending",
                  "summary": null
                }
                """,
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let session = try await client.createSession(projectId: projectId)

        XCTAssertEqual(session.id, sessionId)
        XCTAssertEqual(session.projectId, projectId)
        XCTAssertNil(session.targetArticleId)
        XCTAssertNil(session.endAt)
        XCTAssertEqual(session.consolidationStatus, "pending")
    }

    func testSendTurnPostsMessageAndDecodesTurnResponse() async throws {
        let sessionId = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!

        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/sessions/\(sessionId.uuidString)/turn")
            let body = try XCTUnwrap(request.httpBodyJSON())
            XCTAssertEqual(body["message"] as? String, "What changed?")

            return StubResponse(
                statusCode: 200,
                body: """
                {
                  "text": "A sharper frame.",
                  "usage": {
                    "inputTokens": 12,
                    "outputTokens": 34,
                    "costUsd": 0.0012
                  }
                }
                """,
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let response = try await client.sendTurn(sessionId: sessionId, message: "What changed?")

        XCTAssertEqual(response.text, "A sharper frame.")
        XCTAssertEqual(response.usage.inputTokens, 12)
        XCTAssertEqual(response.usage.outputTokens, 34)
        XCTAssertEqual(response.usage.costUsd, 0.0012)
    }

    func testEndSessionPostsEndAndDecodesSession() async throws {
        let projectId = UUID(uuidString: "44444444-4444-4444-4444-444444444444")!
        let sessionId = UUID(uuidString: "55555555-5555-5555-5555-555555555555")!

        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/sessions/\(sessionId.uuidString)/end")
            let body = try XCTUnwrap(request.httpBodyJSON())
            XCTAssertTrue(body.isEmpty)

            return StubResponse(
                statusCode: 200,
                body: """
                {
                  "id": "\(sessionId.uuidString.lowercased())",
                  "projectId": "\(projectId.uuidString.lowercased())",
                  "targetArticleId": null,
                  "startAt": "2026-05-07T12:00:00.000Z",
                  "endAt": "2026-05-07T12:30:00.000Z",
                  "audioRef": null,
                  "transcriptRef": null,
                  "consolidationStatus": "pending",
                  "summary": null
                }
                """,
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let session = try await client.endSession(sessionId: sessionId)

        XCTAssertEqual(session.id, sessionId)
        XCTAssertNotNil(session.endAt)
    }

    func testSendTurnHTTP409SurfacesServerAPIError() async throws {
        let sessionId = UUID(uuidString: "66666666-6666-6666-6666-666666666666")!

        StubURLProtocol.handler = { _ in
            StubResponse(statusCode: 409, body: #"{"error":"session already ended"}"#)
        }

        let client = APIClient(config: testConfig(), session: stubSession())

        do {
            _ = try await client.sendTurn(sessionId: sessionId, message: "Hello")
            XCTFail("Expected APIError.server")
        } catch APIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "session already ended")
        } catch {
            XCTFail("Expected APIError.server, got \(error)")
        }
    }

    private func testConfig() -> AppConfig {
        AppConfig(apiBaseURL: URL(string: "https://example.test")!, apiSecret: "test-secret")
    }

    private func stubSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private struct StubResponse {
    let statusCode: Int
    let body: String
}

private final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> StubResponse)?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let response = try handler(request)
            let httpResponse = HTTPURLResponse(
                url: request.url!,
                statusCode: response.statusCode,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"],
            )!
            client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(response.body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private extension URLRequest {
    func httpBodyJSON() throws -> [String: Any] {
        let data = try httpBodyData()
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func httpBodyData() throws -> Data {
        if let httpBody {
            return httpBody
        }

        let stream = try XCTUnwrap(httpBodyStream)
        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)

        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 {
                throw stream.streamError ?? URLError(.cannotDecodeContentData)
            }
            if count == 0 {
                break
            }
            data.append(buffer, count: count)
        }

        return data
    }
}
