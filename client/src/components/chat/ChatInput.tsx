import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Send } from "lucide-react";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
}

// The Web Speech API isn't part of TypeScript's DOM lib (still non-standard),
// so we declare just the surface this component actually uses.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useRef(getSpeechRecognitionConstructor() !== null).current;

  // Stop any in-flight recognition on unmount so it doesn't keep the mic open.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        setValue((prev) => (prev.trim() ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim()));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    recognitionRef.current?.stop();
    onSend(trimmed);
    setValue("");
  }

  return (
    <form
      className="mx-8 mb-6 flex items-center gap-2.5 rounded-lg border border-subtle bg-elevated py-2 pl-4.5 pr-2.5"
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type your message..."
        disabled={disabled}
        className="flex-1 bg-transparent py-2.5 text-sm text-primary outline-none placeholder:text-muted"
      />
      <button
        type="button"
        onClick={toggleListening}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        aria-pressed={listening}
        title={speechSupported ? undefined : "Voice input isn't supported in this browser"}
        disabled={disabled || !speechSupported}
        className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${
          listening ? "animate-pulse bg-danger text-accent-contrast" : "bg-danger-soft text-danger"
        }`}
      >
        <Mic size={16} strokeWidth={1.75} />
      </button>
      <button
        type="submit"
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast disabled:opacity-50"
        disabled={disabled || !value.trim()}
      >
        <Send size={15} strokeWidth={1.75} />
      </button>
    </form>
  );
}
