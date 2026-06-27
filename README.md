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
docker build -t jubilai .
docker run -d -p 3000:3000 --name jubilai jubilai
```

Boom. Arena's up. Point your browser to `http://localhost:3000` and start debating.

---

## 📝 Use Cases (For the Brave and the Bored)
- **The "I Can't Decide" Helper**: Can't choose a vacation spot? Have two AIs argue for the best one while you sip your coffee.
- **The Philosophy Lab**: Test deep questions like *"Do machines have souls?"* and see which side of the logic holds up better.
- **The "Just for Laughs" Arena**: Put AI in a debate about something utterly trivial, like which mythical creature would be the best roommate.

---

*Disclaimer: jubilAI is for entertainment purposes. While our AIs are very smart, they do not have feelings, do not actually care about pineapple pizza, and are not responsible for any existential crises triggered by their high-level logic.*
