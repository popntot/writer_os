import Foundation
import XCTest
@testable import WriterOS

final class SSEStreamConsumerTests: XCTestCase {
    func testParsesTextOnlyStreamWithDone() async throws {
        let events = try await collectEvents(
            """
            event: text
            data: {"delta":"I think"}

            event: done
            data: {}

            """
        )

        XCTAssertEqual(events, [.text("I think"), .done])
    }

    func testParsesTextAndAudioInterleaved() async throws {
        let events = try await collectEvents(
            """
            event: text
            data: {"delta":"Hello "}

            event: audio
            data: {"chunk":"AQID","format":"pcm_16000"}

            event: text
            data: {"delta":"there"}

            event: done
            data: {}

            """
        )

        XCTAssertEqual(
            events,
            [
                .text("Hello "),
                .audio(chunkBase64: "AQID", format: "pcm_16000"),
                .text("there"),
                .done,
            ]
        )
    }

    func testParsesUsageAndErrorEvents() async throws {
        let events = try await collectEvents(
            """
            event: usage
            data: {"llm":{"model":"claude-sonnet-4-6","inputTokens":1,"outputTokens":2,"cacheCreationInputTokens":0,"cacheReadInputTokens":0,"costUsd":0.25,"durationMs":9},"tts":{"voiceId":"voice","charactersUsed":12,"costUsd":0.1,"durationMs":4}}

            event: error
            data: {"message":"upstream failed"}

            event: done
            data: {}

            """
        )

        XCTAssertEqual(
            events,
            [
                .usage(
                    TurnStreamUsage(
                        llm: LLMUsageEvent(
                            model: "claude-sonnet-4-6",
                            inputTokens: 1,
                            outputTokens: 2,
                            cacheCreationInputTokens: 0,
                            cacheReadInputTokens: 0,
                            costUsd: 0.25,
                            durationMs: 9
                        ),
                        tts: TTSUsageEvent(
                            voiceId: "voice",
                            charactersUsed: 12,
                            costUsd: 0.1,
                            durationMs: 4
                        )
                    )
                ),
                .error("upstream failed"),
                .done,
            ]
        )
    }

    func testUnknownEventNameIsSurfaced() async throws {
        let events = try await collectEvents(
            """
            event: mystery
            data: {"value":1}

            """
        )

        XCTAssertEqual(events, [.unknown(event: "mystery", data: #"{"value":1}"#)])
    }

    func testTerminalDoneStopsConsumer() async throws {
        let events = try await collectEvents(
            """
            event: done
            data: {}

            """
        )

        XCTAssertEqual(events, [.done])
    }

    private func collectEvents(_ body: String) async throws -> [SSEEvent] {
        var events: [SSEEvent] = []
        let consumer = SSEStreamConsumer(data: Data(body.utf8))

        for try await event in consumer {
            events.append(event)
        }

        return events
    }
}
