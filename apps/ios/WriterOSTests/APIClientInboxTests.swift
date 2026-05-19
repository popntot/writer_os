import XCTest
@testable import WriterOS

final class APIClientInboxTests: XCTestCase {
    override func tearDown() {
        InboxStubURLProtocol.handler = nil
        super.tearDown()
    }

    func testDepositInboxPostsTextDumpAndDecodesResponse() async throws {
        let itemId = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!

        InboxStubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/inbox")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-secret")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try XCTUnwrap(request.httpBodyJSON())
            XCTAssertEqual(body["captureSurface"] as? String, "ios-app-dump")
            let rawContent = try XCTUnwrap(body["rawContent"] as? [String: Any])
            XCTAssertEqual(rawContent["type"] as? String, "text")
            XCTAssertEqual(rawContent["body"] as? String, "Saved from a walk.")

            return InboxStubResponse(
                statusCode: 201,
                body: """
                {
                  "itemId": "\(itemId.uuidString.lowercased())",
                  "status": "captured"
                }
                """,
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let response = try await client.depositInbox(
            content: "Saved from a walk.",
            surface: "ios-app-dump",
        )

        XCTAssertEqual(response.itemId, itemId)
        XCTAssertEqual(response.status, "captured")
    }

    func testListPendingInboxDecodesItems() async throws {
        let itemId = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        let projectId = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!

        InboxStubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/inbox/pending")

            return InboxStubResponse(
                statusCode: 200,
                body: """
                [
                  {
                    "id": "\(itemId.uuidString.lowercased())",
                    "rawContentRef": "inline-json:%7B%7D",
                    "contentType": "text",
                    "captureSurface": "ios-app-dump",
                    "status": "triaged-pending",
                    "decision": {
                      "kind": "proposed",
                      "projectId": "\(projectId.uuidString.lowercased())",
                      "confidence": 0.5,
                      "reasoning": "stub"
                    },
                    "proposedProjectId": "\(projectId.uuidString.lowercased())",
                    "resolvedProjectId": null,
                    "sourceId": null,
                    "agentReasoning": "stub",
                    "depositedAt": "2026-05-18T12:00:00.000Z",
                    "triagedAt": "2026-05-18T12:00:01.000Z",
                    "filedAt": null,
                    "lastActionAt": "2026-05-18T12:00:01.000Z",
                    "contentPreview": "A useful captured quote"
                  }
                ]
                """,
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let items = try await client.listPendingInbox()

        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].id, itemId)
        XCTAssertEqual(items[0].status, "triaged-pending")
        XCTAssertEqual(items[0].proposedProjectId, projectId)
        XCTAssertEqual(items[0].contentPreview, "A useful captured quote")
    }

    func testConfirmInboxItemPostsProjectAndDecodesUpdatedItem() async throws {
        let itemId = UUID(uuidString: "44444444-4444-4444-4444-444444444444")!
        let projectId = UUID(uuidString: "55555555-5555-5555-5555-555555555555")!
        let sourceId = UUID(uuidString: "66666666-6666-6666-6666-666666666666")!

        InboxStubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/inbox/\(itemId.uuidString)/confirm")
            let body = try XCTUnwrap(request.httpBodyJSON())
            XCTAssertEqual(body["projectId"] as? String, projectId.uuidString)

            return InboxStubResponse(
                statusCode: 200,
                body: """
                {
                  "id": "\(itemId.uuidString.lowercased())",
                  "rawContentRef": "inline-json:%7B%7D",
                  "contentType": "text",
                  "captureSurface": "ios-app-dump",
                  "status": "filed",
                  "decision": {
                    "kind": "proposed",
                    "projectId": "\(projectId.uuidString.lowercased())",
                    "confidence": 0.5,
                    "reasoning": "stub"
                  },
                  "proposedProjectId": "\(projectId.uuidString.lowercased())",
                  "resolvedProjectId": "\(projectId.uuidString.lowercased())",
                  "sourceId": "\(sourceId.uuidString.lowercased())",
                  "agentReasoning": "stub",
                  "depositedAt": "2026-05-18T12:00:00.000Z",
                  "triagedAt": "2026-05-18T12:00:01.000Z",
                  "filedAt": "2026-05-18T12:00:02.000Z",
                  "lastActionAt": "2026-05-18T12:00:02.000Z",
                  "contentPreview": "confirmed"
                }
                """,
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let item = try await client.confirmInboxItem(itemId, projectId: projectId)

        XCTAssertEqual(item.status, "filed")
        XCTAssertEqual(item.resolvedProjectId, projectId)
        XCTAssertEqual(item.sourceId, sourceId)
    }

    private func testConfig() -> AppConfig {
        AppConfig(apiBaseURL: URL(string: "https://example.test")!, apiSecret: "test-secret")
    }

    private func stubSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [InboxStubURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private struct InboxStubResponse {
    let statusCode: Int
    let body: String
}

private final class InboxStubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> InboxStubResponse)?

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
