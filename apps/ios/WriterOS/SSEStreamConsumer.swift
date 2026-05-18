import Foundation

enum SSEEvent: Equatable, Sendable {
    case text(String)
    case audio(chunkBase64: String, format: String)
    case usage(TurnStreamUsage)
    case done
    case error(String)
    case unknown(event: String, data: String)
}

struct TurnStreamUsage: Codable, Equatable, Hashable, Sendable {
    let llm: LLMUsageEvent
    let tts: TTSUsageEvent?
}

struct LLMUsageEvent: Codable, Equatable, Hashable, Sendable {
    let model: String
    let inputTokens: Int
    let outputTokens: Int
    let cacheCreationInputTokens: Int
    let cacheReadInputTokens: Int
    let costUsd: Double
    let durationMs: Int
}

struct TTSUsageEvent: Codable, Equatable, Hashable, Sendable {
    let voiceId: String
    let charactersUsed: Int
    let costUsd: Double
    let durationMs: Int
}

struct SSEStreamConsumer: AsyncSequence, Sendable {
    typealias Element = SSEEvent

    private let byteStream: AsyncThrowingStream<UInt8, Error>

    init(request: URLRequest, session: URLSession = .shared) {
        byteStream = AsyncThrowingStream { continuation in
            Task {
                do {
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        throw APIError.invalidResponse
                    }

                    if httpResponse.statusCode != 200 {
                        let data = try await Self.collect(bytes: bytes)
                        throw Self.apiError(statusCode: httpResponse.statusCode, data: data)
                    }

                    for try await byte in bytes {
                        continuation.yield(byte)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    init(data: Data) {
        byteStream = AsyncThrowingStream { continuation in
            for byte in data {
                continuation.yield(byte)
            }
            continuation.finish()
        }
    }

    func makeAsyncIterator() -> Iterator {
        Iterator(byteIterator: byteStream.makeAsyncIterator())
    }

    struct Iterator: AsyncIteratorProtocol {
        private var byteIterator: AsyncThrowingStream<UInt8, Error>.Iterator
        private var pendingEvent: String?
        private var pendingDataLines: [String] = []
        private var didFinish = false

        init(byteIterator: AsyncThrowingStream<UInt8, Error>.Iterator) {
            self.byteIterator = byteIterator
        }

        mutating func next() async throws -> SSEEvent? {
            guard !didFinish else { return nil }

            while let line = try await readLine() {
                if line.isEmpty {
                    if let event = try flushEvent() {
                        return event
                    }
                    continue
                }

                if line.hasPrefix("event:") {
                    pendingEvent = fieldValue(from: line)
                } else if line.hasPrefix("data:") {
                    pendingDataLines.append(fieldValue(from: line))
                }
            }

            didFinish = true
            return try flushEvent()
        }

        private mutating func readLine() async throws -> String? {
            var bytes: [UInt8] = []

            while let byte = try await byteIterator.next() {
                if byte == 10 {
                    if bytes.last == 13 {
                        bytes.removeLast()
                    }
                    return String(decoding: bytes, as: UTF8.self)
                }

                bytes.append(byte)
            }

            if bytes.isEmpty {
                return nil
            }

            if bytes.last == 13 {
                bytes.removeLast()
            }
            return String(decoding: bytes, as: UTF8.self)
        }

        private mutating func flushEvent() throws -> SSEEvent? {
            guard pendingEvent != nil || !pendingDataLines.isEmpty else {
                return nil
            }

            let event = pendingEvent ?? ""
            let data = pendingDataLines.joined(separator: "\n")
            pendingEvent = nil
            pendingDataLines = []

            return try Self.decode(event: event, data: data)
        }

        private static func decode(event: String, data: String) throws -> SSEEvent {
            let decoder = JSONDecoder()
            let jsonData = Data(data.utf8)

            switch event {
            case "text":
                let payload = try decoder.decode(TextPayload.self, from: jsonData)
                return .text(payload.delta)
            case "audio":
                let payload = try decoder.decode(AudioPayload.self, from: jsonData)
                return .audio(chunkBase64: payload.chunk, format: payload.format)
            case "usage":
                return .usage(try decoder.decode(TurnStreamUsage.self, from: jsonData))
            case "done":
                return .done
            case "error":
                let payload = try decoder.decode(ErrorPayload.self, from: jsonData)
                return .error(payload.message)
            default:
                return .unknown(event: event, data: data)
            }
        }

        private func fieldValue(from line: String) -> String {
            guard let colon = line.firstIndex(of: ":") else {
                return ""
            }

            var valueStart = line.index(after: colon)
            if valueStart < line.endIndex, line[valueStart] == " " {
                valueStart = line.index(after: valueStart)
            }
            return String(line[valueStart...])
        }
    }

    private static func collect(bytes: URLSession.AsyncBytes) async throws -> Data {
        var data = Data()
        for try await byte in bytes {
            data.append(byte)
        }
        return data
    }

    private static func apiError(statusCode: Int, data: Data) -> APIError {
        if statusCode == 401 {
            return .unauthorized
        }

        let message = decodeErrorMessage(from: data)
        if statusCode == 400 {
            return .badRequest(message)
        }

        return .server(statusCode, message)
    }

    private static func decodeErrorMessage(from data: Data) -> String {
        struct ErrorBody: Decodable { let error: String }
        if let body = try? JSONDecoder().decode(ErrorBody.self, from: data) {
            return body.error
        }
        return String(data: data, encoding: .utf8) ?? "<no body>"
    }
}

private struct TextPayload: Decodable {
    let delta: String
}

private struct AudioPayload: Decodable {
    let chunk: String
    let format: String
}

private struct ErrorPayload: Decodable {
    let message: String
}
