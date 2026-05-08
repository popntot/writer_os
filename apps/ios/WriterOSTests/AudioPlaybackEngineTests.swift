import Foundation
import XCTest
@testable import WriterOS

final class AudioPlaybackEngineTests: XCTestCase {
    @MainActor
    func testInt16PCMDecodesToFloat32Samples() {
        let data = pcmData([0, 16_384, -16_384])

        let samples = AudioPlaybackEngine.decodePCMInt16ToFloat32(data)

        XCTAssertEqual(samples[0], 0, accuracy: 0.0001)
        XCTAssertEqual(samples[1], 0.5, accuracy: 0.0001)
        XCTAssertEqual(samples[2], -0.5, accuracy: 0.0001)
    }

    @MainActor
    func testInt16BoundarySamplesDecodeNearUnitRange() {
        let data = pcmData([Int16.max, Int16.min])

        let samples = AudioPlaybackEngine.decodePCMInt16ToFloat32(data)

        XCTAssertEqual(samples[0], 1.0, accuracy: 0.0001)
        XCTAssertEqual(samples[1], -1.0, accuracy: 0.0001)
    }

    @MainActor
    func testEnqueueSchedulesDecodedSamplesWithoutRealAudioOutput() throws {
        let backend = RecordingAudioBackend()
        let engine = AudioPlaybackEngine(backend: backend)

        try engine.start()
        try engine.enqueue(pcmInt16Data: pcmData([Int16.max, 0]))

        XCTAssertEqual(backend.startCount, 1)
        XCTAssertEqual(backend.scheduledSamples.count, 1)
        XCTAssertEqual(backend.scheduledSamples[0][0], 1.0, accuracy: 0.0001)
        XCTAssertEqual(backend.scheduledSamples[0][1], 0.0, accuracy: 0.0001)
        XCTAssertEqual(engine.pendingBufferCount, 1)

        backend.completeScheduledBuffer(at: 0)

        XCTAssertEqual(engine.pendingBufferCount, 0)
    }

    @MainActor
    func testResetClearsPendingBuffersAndBackendState() throws {
        let backend = RecordingAudioBackend()
        let engine = AudioPlaybackEngine(backend: backend)

        try engine.enqueue(pcmInt16Data: pcmData([1, 2, 3]))

        XCTAssertEqual(engine.pendingBufferCount, 1)

        engine.reset()

        XCTAssertEqual(engine.pendingBufferCount, 0)
        XCTAssertEqual(backend.resetCount, 1)
        XCTAssertTrue(backend.scheduledSamples.isEmpty)
    }

    private func pcmData(_ samples: [Int16]) -> Data {
        var data = Data()

        for sample in samples {
            let littleEndian = sample.littleEndian
            withUnsafeBytes(of: littleEndian) { bytes in
                data.append(contentsOf: bytes)
            }
        }

        return data
    }
}

@MainActor
private final class RecordingAudioBackend: AudioPlaybackBackend {
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var resetCount = 0
    private(set) var scheduledSamples: [[Float]] = []
    private var completions: [@MainActor () -> Void] = []

    func start() throws {
        startCount += 1
    }

    func stop() {
        stopCount += 1
    }

    func reset() {
        resetCount += 1
        scheduledSamples = []
        completions = []
    }

    func schedule(samples: [Float], completion: @escaping @MainActor () -> Void) throws {
        scheduledSamples.append(samples)
        completions.append(completion)
    }

    func completeScheduledBuffer(at index: Int) {
        completions[index]()
    }
}
