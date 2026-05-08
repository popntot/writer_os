import AVFoundation
import Foundation

@MainActor
protocol AudioPlaying: AnyObject {
    func start() throws
    func stop()
    func reset()
    func enqueue(pcmInt16Data: Data) throws
}

@MainActor
protocol AudioPlaybackBackend: AnyObject {
    func start() throws
    func stop()
    func reset()
    func schedule(samples: [Float], completion: @escaping @MainActor () -> Void) throws
}

@MainActor
final class AudioPlaybackEngine: AudioPlaying {
    static let sampleRate = 16_000.0

    private let backend: AudioPlaybackBackend
    private(set) var pendingBufferCount = 0

    init(backend: AudioPlaybackBackend = AVAudioPlaybackBackend()) {
        self.backend = backend
    }

    func start() throws {
        try backend.start()
    }

    func stop() {
        backend.stop()
    }

    func reset() {
        pendingBufferCount = 0
        backend.reset()
    }

    func enqueue(pcmInt16Data: Data) throws {
        let samples = Self.decodePCMInt16ToFloat32(pcmInt16Data)
        guard !samples.isEmpty else { return }

        pendingBufferCount += 1
        try backend.schedule(samples: samples) { [weak self] in
            guard let self else { return }
            self.pendingBufferCount = max(0, self.pendingBufferCount - 1)
        }
    }

    static func decodePCMInt16ToFloat32(_ data: Data) -> [Float] {
        let sampleCount = data.count / 2
        var samples: [Float] = []
        samples.reserveCapacity(sampleCount)

        for index in 0..<sampleCount {
            let byteIndex = index * 2
            let low = UInt16(data[byteIndex])
            let high = UInt16(data[byteIndex + 1]) << 8
            let sample = Int16(bitPattern: high | low)
            samples.append(Float(sample) / Float(Int16.max))
        }

        return samples
    }
}

@MainActor
private final class AVAudioPlaybackBackend: AudioPlaybackBackend {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: AudioPlaybackEngine.sampleRate,
        channels: 1,
        interleaved: false
    )!
    private var isConfigured = false

    func start() throws {
        configureIfNeeded()

        if !engine.isRunning {
            try engine.start()
        }

        if !player.isPlaying {
            player.play()
        }
    }

    func stop() {
        player.stop()
        engine.stop()
    }

    func reset() {
        player.stop()
        player.reset()
        engine.stop()
    }

    func schedule(samples: [Float], completion: @escaping @MainActor () -> Void) throws {
        configureIfNeeded()

        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(samples.count)
        ) else {
            throw APIError.invalidResponse
        }

        buffer.frameLength = AVAudioFrameCount(samples.count)
        guard let channel = buffer.floatChannelData?[0] else {
            throw APIError.invalidResponse
        }

        for (index, sample) in samples.enumerated() {
            channel[index] = sample
        }

        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { _ in
            Task { @MainActor in completion() }
        }
    }

    private func configureIfNeeded() {
        guard !isConfigured else { return }

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        isConfigured = true
    }
}
