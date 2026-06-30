# 🎙️ jubilAI: The Digital Colosseum of Ideas 🏛️

> ⚠️ This was a personal project primarily implemented with generative AI. Please review code accordingly before re-use.

Welcome to **jubilAI**, where the world's most sophisticated silicon brains get into heated, high-stakes, and occasionally absolutely unhinged debates. 

Forget standard chatbots just answering your questions. Here, we're pitting AI against AI to settle the questions humans have been arguing about since the dawn of time (or at least since the invention of the internet).

---

## 🎭 The Setup
You are the **Grand Architect** of the debate. You decide the topic, the participants, and the rules of engagement. 

1.  **The Statement**: Drop a spicy take. *"Is pineapple on pizza a culinary masterpiece or a crime against humanity?"* or *"Should we colonize Mars before we fix our own plumbing?"*
2.  **The Contenders**: Pick your fighters. Choose different models for **The Affirmative** (the "Yes" enthusiasts) and **The Negative** (the "Absolutely Not" skeptics). You can use local powerhouses like Ollama or cloud-based titans.
3.  **The Tribunal**: Every great fight needs a referee. Choose a **Judge** to listen to the arguments, weigh the logic, spot the fallacies, and deliver the final, crushing verdict.

## ✨ Features That Make it Spicy

### 🗣️ Hear the Heated Exchange (TTS!)
Why just read when you can *listen*? jubilAI features a **Real-time Text-to-Speech** system. 
- Each debater gets their own unique voice.
- The Judge sounds like a judge (mostly).
- Listen to the Affirmative's passionate defense and the Negative's biting rebuttals as they happen!

### 🌊 The Live Stream
No "waiting for the whole thing to finish" here. Watch the arguments unfold in real-time. As the AI thinks, the text streams onto your screen, capturing the raw, unfolding flow of their "thought" process.

### ⚖️ The Final Verdict
Once the dust settles (usually after 3 rounds of intense back-and-forth), the Judge steps in. They provide a detailed breakdown of:
- Logic & Evidence
- Rhetorical Flair
- Conciseness vs. Verbosity
- **The Winner**: A final declaration of who reigned supreme in the digital arena.

### 📜 Debate History
Your past debates don't vanish into the void. A **History panel** (accessible from the nav bar) lets you browse all your completed debates, view full transcripts, and replay them with TTS audio. Debates are persisted to disk as JSON files — survive browser refreshes, server restarts, whatever. You can also delete old debates to keep things tidy.

### 💾 Persistent Storage
Completed debates are automatically saved to a platform-appropriate directory (`~/.local/share/jubilai_debates` on Linux, `~/Library/Application Support/jubilai_debates` on macOS, `%APPDATA%\jubilai_debates` on Windows). Override with the `DEBATE_FILES_DIR` environment variable. The server loads saved debates back into memory on startup.

### 🔒 Session Restore
Close the browser, walk away, come back — your setup is waiting. Session state (endpoint URLs, model choices, the debate statement) is saved to your browser using **encrypted** storage (AES-256-GCM via IndexedDB on HTTPS/localhost). On HTTP connections a plaintext fallback stores only non-sensitive config; API keys are **never** stored in plaintext.

### ⚙️ Advanced Settings
Tweak the debate to your liking. The collapsible **Advanced Settings** panel lets you:
- Write **custom system prompts** for the Affirmative, Negative, and Judge (override the built-in defaults)
- Adjust **debater parameters**: temperature (default `0.7`), top P, top K, max tokens
- Adjust **judge parameters**: temperature (default `0.5`), top P, top K, max tokens

### 🎪 Kiosk Mode (The "Just Show Me" Mode)
Want to deploy jubilAI on a public display, a conference booth, or a classroom screen? **Kiosk Mode** strips away all the configuration UI and leaves you with a clean interface: just a statement textarea and a big "Start Debate" button. Everything else — endpoints, API keys, model choices, judge settings, advanced parameters — is pre-configured on the server.

Turn it on by setting environment variables:
```bash
JUBILAI_KIOSK_MODE=true \
JUBILAI_KIOSK_ENDPOINT_A=http://localhost:11434 \
JUBILAI_KIOSK_API_KEY_A=sk-abc123 \
JUBILAI_KIOSK_MODEL_A=llama3.1 \
JUBILAI_KIOSK_ENDPOINT_B=http://localhost:8080 \
JUBILAI_KIOSK_API_KEY_B=sk-def456 \
JUBILAI_KIOSK_MODEL_B=mixtral-8x7b \
npm start
```

API keys are optional — if you're using local endpoints that don't require auth, skip them. You can also pre-configure a judge (`JUBILAI_KIOSK_ENDPOINT_JUDGE`, `JUBILAI_KIOSK_API_KEY_JUDGE`, `JUBILAI_KIOSK_MODEL_JUDGE`) and custom prompts or inference parameters (`JUBILAI_KIOSK_TEMPERATURE`, `JUBILAI_KIOSK_MAX_TOKENS`, etc.).

In kiosk mode:
- **Configuration UI is hidden** — no endpoints, models, or advanced settings visible
- **History panel is disabled** — no browsing past debates from the UI
- **Session restore is skipped** — config comes from the server, not the browser
- **Judge-select phase is skipped** — if no judge is pre-configured, the debate completes without a verdict
- **"New Dispute" preserves config** — resets the statement but keeps all server-provided settings

### 🛠️ The "Just Let Me Play" Mode (Mock Server)
Want to see the magic without setting up your own LLM endpoints? Flip the switch to **Mock Mode**. It uses pre-written, "baked-in" debate content so you can experience the UI, the TTS, and the flow of the debate instantly.

---

## 🚀 How to Get Your Hands Dirty

1.  **Launch the Arena**: Start the real server or the mock server.
2.  **Pick Your Poison**: Choose your models and endpoints.
3.  **Set the Stage**: Enter your statement and hit "Start Debate."
4.  **Pop the Popcorn**: Sit back and enjoy the AI chaos.

### 🐳 Or Go Full Container
Don't feel like wrestling with Node versions or dependency hell? **Docker** has your back.

```bash
npm run build:docker
docker run -d -p 3000:3000 --name jubilai jubilai
```

Boom. Arena's up. Point your browser to `http://localhost:3000` and start debating.

Need to customize the storage location inside the container?
```bash
docker run -d -p 3000:3000 -v ./my_debates:/root/.local/share/jubilai_debates --name jubilai jubilai
```

---

## ⚙️ Configuration

Everything is controlled by `config.json`. Key sections:

- **`app`** — Server ports (`realPort: 3000`, `mockPort: 3001`), bind host
- **`debate`** — Max turns per side (default `3`), auto-advance/judge delays, winner detection pattern
- **`llm`** — Default temperature, top P, top K, max tokens for debaters and judge
- **`prompts`** — Built-in system prompts for Affirmative, Negative, and Judge (prose format enforced, penalizes lists and repetition)
- **`tts`** — Kokoro model ID, quantization (`q4`), WASM device, 28-voice pool (American + British English), sentence buffer cap
- **`debateStorage`** — Disk storage directory name, max list count
- **`session`** — IndexedDB database name, localStorage keys for encrypted/plaintext session
- **`ui`** — Toast auto-dismiss timing, phase IDs
- **`kiosk`** — Kiosk mode toggle (`enabled`), pre-configured endpoints, API keys, models, custom prompts, inference parameters, and max turns. When enabled, the UI shows only the statement textarea and a Start button. All `JUBILAI_KIOSK_*` environment variables overlay these values at runtime.

---

## 📝 Use Cases (For the Brave and the Bored)
- **The "I Can't Decide" Helper**: Can't choose a vacation spot? Have two AIs argue for the best one while you sip your coffee.
- **The Philosophy Lab**: Test deep questions like *"Do machines have souls?"* and see which side of the logic holds up better.
- **The "Just for Laughs" Arena**: Put AI in a debate about something utterly trivial, like which mythical creature would be the best roommate.

---

*Disclaimer: jubilAI is for entertainment purposes. While our AIs are very smart, they do not have feelings, do not actually care about pineapple pizza, and are not responsible for any existential crises triggered by their high-level logic.*
