import XCTest
@testable import WriterOS

final class APIClientSettingsTests: XCTestCase {
    override func tearDown() {
        SettingsStubURLProtocol.handler = nil
        super.tearDown()
    }

    func testGetSettingsDecodesResponse() async throws {
        SettingsStubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/settings")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-secret")

            return SettingsStubResponse(
                statusCode: 200,
                body: """
                {
                  "id": "singleton",
                  "audioCaptureDefault": true,
                  "audioRetentionHotDays": 14,
                  "audioRetentionColdDays": 120,
                  "locationTagDefault": true,
                  "updatedAt": "2026-05-18T12:00:00.000Z"
                }
                """
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let settings = try await client.getSettings()

        XCTAssertEqual(settings.id, "singleton")
        XCTAssertTrue(settings.audioCaptureDefault)
        XCTAssertEqual(settings.audioRetentionHotDays, 14)
        XCTAssertEqual(settings.audioRetentionColdDays, 120)
        XCTAssertTrue(settings.locationTagDefault)
        XCTAssertEqual(settings.updatedAt, "2026-05-18T12:00:00.000Z")
    }

    func testUpdateSettingsSendsPatchBodyAndDecodesResponse() async throws {
        SettingsStubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "PATCH")
            XCTAssertEqual(request.url?.path, "/settings")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-secret")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try XCTUnwrap(request.settingsHTTPBodyJSON())
            XCTAssertEqual(body["audioCaptureDefault"] as? Bool, true)
            XCTAssertEqual(body["audioRetentionHotDays"] as? Int, 7)
            XCTAssertNil(body["audioRetentionColdDays"])
            XCTAssertNil(body["locationTagDefault"])

            return SettingsStubResponse(
                statusCode: 200,
                body: """
                {
                  "id": "singleton",
                  "audioCaptureDefault": true,
                  "audioRetentionHotDays": 7,
                  "audioRetentionColdDays": 365,
                  "locationTagDefault": false,
                  "updatedAt": "2026-05-18T12:01:00.000Z"
                }
                """
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())
        let settings = try await client.updateSettings(
            patch: SettingsPatch(audioCaptureDefault: true, audioRetentionHotDays: 7)
        )

        XCTAssertTrue(settings.audioCaptureDefault)
        XCTAssertEqual(settings.audioRetentionHotDays, 7)
        XCTAssertEqual(settings.audioRetentionColdDays, 365)
        XCTAssertFalse(settings.locationTagDefault)
    }

    func testErrorResponseSurfacesAsSwiftError() async throws {
        SettingsStubURLProtocol.handler = { _ in
            SettingsStubResponse(
                statusCode: 400,
                body: #"{"error":"audioRetentionHotDays must be less than or equal to audioRetentionColdDays"}"#
            )
        }

        let client = APIClient(config: testConfig(), session: stubSession())

        do {
            _ = try await client.updateSettings(
                patch: SettingsPatch(audioRetentionHotDays: 400, audioRetentionColdDays: 30)
            )
            XCTFail("Expected APIError.badRequest")
        } catch APIError.badRequest(let message) {
            XCTAssertEqual(
                message,
                "audioRetentionHotDays must be less than or equal to audioRetentionColdDays"
            )
        } catch {
            XCTFail("Expected APIError.badRequest, got \(error)")
        }
    }

    private func testConfig() -> AppConfig {
        AppConfig(apiBaseURL: URL(string: "https://example.test")!, apiSecret: "test-secret")
    }

    private func stubSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SettingsStubURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private struct SettingsStubResponse {
    let statusCode: Int
    let body: String
}

private final class SettingsStubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> SettingsStubResponse)?

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
                headerFields: ["Content-Type": "application/json"]
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
    func settingsHTTPBodyJSON() throws -> [String: Any] {
        let data = try settingsHTTPBodyData()
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func settingsHTTPBodyData() throws -> Data {
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
