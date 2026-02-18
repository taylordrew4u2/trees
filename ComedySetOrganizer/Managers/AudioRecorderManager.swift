//
//  AudioRecorderManager.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import AVFoundation
import Combine

class AudioRecorderManager: NSObject, ObservableObject {
    private var audioRecorder: AVAudioRecorder?
    private var timer: Timer?
    private var currentFileURL: URL?
    
    @Published var isRecording = false
    @Published var isPaused = false
    @Published var recordingTime: TimeInterval = 0
    @Published var recordingError: String?
    
    private let audioSession = AVAudioSession.sharedInstance()
    
    override init() {
        super.init()
        setupAudioSession()
    }
    
    private func setupAudioSession() {
        do {
            try audioSession.setCategory(.playAndRecord, mode: .default)
            try audioSession.setActive(true)
        } catch {
            recordingError = "Audio session setup failed: \(error.localizedDescription)"
        }
    }
    
    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            audioSession.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
    
    func startRecording(setListName: String) async -> URL? {
        let permissionGranted = await requestPermission()
        guard permissionGranted else {
            recordingError = "Microphone permission denied. Please enable in Settings."
            return nil
        }
        
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let formatter = ISO8601DateFormatter()
        let dateString = formatter.string(from: Date())
        let fileName = "\(setListName) - \(dateString).m4a"
        let fileURL = documentsPath.appendingPathComponent(fileName)
        
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            audioRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
            audioRecorder?.delegate = self
            audioRecorder?.record()
            
            currentFileURL = fileURL
            isRecording = true
            isPaused = false
            recordingTime = 0
            recordingError = nil
            
            startTimer()
            return fileURL
        } catch {
            recordingError = "Recording failed: \(error.localizedDescription)"
            return nil
        }
    }
    
    func pauseRecording() {
        audioRecorder?.pause()
        isPaused = true
        timer?.invalidate()
    }
    
    func resumeRecording() {
        audioRecorder?.record()
        isPaused = false
        startTimer()
    }
    
    func stopRecording() -> URL? {
        audioRecorder?.stop()
        timer?.invalidate()
        isRecording = false
        isPaused = false
        
        let fileURL = currentFileURL
        currentFileURL = nil
        return fileURL
    }
    
    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            self.recordingTime += 1
        }
    }
}

extension AudioRecorderManager: AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            recordingError = "Recording failed to save"
        }
    }
    
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        recordingError = "Recording error: \(error?.localizedDescription ?? "Unknown error")"
    }
}
