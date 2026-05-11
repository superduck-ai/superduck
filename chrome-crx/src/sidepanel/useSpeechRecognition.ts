import { useState, useRef, useEffect, useCallback } from 'react';

interface SpeechSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognitionWindow = Window & {
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface UseSpeechRecognitionReturn {
  isRecording: boolean;
  speechSegments: SpeechSegment[];
  currentInterimTranscript: string;
  error: string | null;
  isSupported: boolean;
  hasPermission: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  clearSegments: () => void;
}

export const useSpeechRecognition = (lang?: string): UseSpeechRecognitionReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [speechSegments, setSpeechSegments] = useState<SpeechSegment[]>([]);
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isActiveRef = useRef(false);
  const interimTimestampRef = useRef(0);
  const restartCountRef = useRef(0);

  // Check if speech recognition is supported
  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Check microphone permission
  useEffect(() => {
    (async () => {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setHasPermission(permissionStatus.state === 'granted');

        permissionStatus.addEventListener('change', () => {
          setHasPermission(permissionStatus.state === 'granted');
        });
      } catch {
        setHasPermission(false);
      }
    })();
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) return;

    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognitionAPI =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang || navigator.language || 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const now = Date.now();
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) {
            const segment: SpeechSegment = {
              text: finalText,
              timestamp: interimTimestampRef.current > 0 ? interimTimestampRef.current : now,
              isFinal: true,
            };

            setSpeechSegments((prev) => [...prev.filter((s) => s.isFinal), segment]);
            setCurrentInterimTranscript('');
            interimTimestampRef.current = 0;
          }
        } else {
          interimText += transcript + ' ';
        }
      }

      if (interimText.trim()) {
        const trimmedInterim = interimText.trim();
        if (interimTimestampRef.current === 0) {
          interimTimestampRef.current = now;
        }

        setCurrentInterimTranscript(trimmedInterim);
        setSpeechSegments((prev) => [
          ...prev.filter((s) => s.isFinal),
          {
            text: trimmedInterim,
            timestamp: interimTimestampRef.current,
            isFinal: false,
          },
        ]);
      }
    };

    recognition.onend = () => {
      if (isActiveRef.current) {
        restartCountRef.current = 0;
        try {
          recognition.start();
        } catch (err) {
          setIsRecording(false);
          isActiveRef.current = false;
          setError('Speech recognition stopped unexpectedly');
        }
      } else {
        setIsRecording(false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setHasPermission(false);
        isActiveRef.current = false;
        setIsRecording(false);
        setError('Microphone permission denied');
      } else if (event.error === 'no-speech') {
        // Ignore no-speech errors
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          isActiveRef.current = false;
          recognitionRef.current.stop();
        } catch {
          // Ignore errors during cleanup
        }
      }
    };
  }, [isSupported, lang]);

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return false;
    }

    if (!recognitionRef.current) {
      setError('Speech recognition not initialized');
      return false;
    }

    try {
      setSpeechSegments([]);
      setCurrentInterimTranscript('');
      interimTimestampRef.current = 0;
      restartCountRef.current = 0;
      isActiveRef.current = true;

      // Let the Speech Recognition API handle permission request
      // The browser will show native permission prompt if needed
      recognitionRef.current.start();
      setIsRecording(true);
      setError(null);
      setHasPermission(true); // Assume granted if start succeeds
      return true;
    } catch (err) {
      isActiveRef.current = false;
      setError('Failed to start speech recording');
      return false;
    }
  }, [isSupported]);

  // Stop recording
  const stopRecording = useCallback(() => {
    isActiveRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors
      }
    }

    setIsRecording(false);
  }, []);

  // Clear segments
  const clearSegments = useCallback(() => {
    setSpeechSegments([]);
  }, []);

  return {
    isRecording,
    speechSegments,
    currentInterimTranscript,
    error,
    isSupported,
    hasPermission,
    startRecording,
    stopRecording,
    clearSegments,
  };
};
