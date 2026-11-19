# 🌟 Lumen Studio

**Your Private, Self-Hosted AI Dashboard.**

Lumen Studio is a unified interface for generating media, chatting with AI, and coding—all running locally on your hardware and accessible from anywhere via a private Tailscale network. 

Experience the power of local AI without the privacy trade-offs. No cloud telemetry. No forced subscriptions. Just your models, your data, your rules.

## ✨ Why Lumen Studio?

*   **🎨 Unified Studio:** Generate images, edit photos, create music, and synthesize voice in one polished, dark-mode interface.
*   **💬 Private Chat:** Uncensored, local LLM conversations with persistent history stored entirely on your machine.
*   **💻 Intelligent Code Workspace:** A full coding environment with project isolation ("the fence") and real-time artifact preview.
*   **📊 Real-Time Cost Tracking:** Monitor GPU usage and electricity costs for every generation and chat session. Know exactly what your AI usage costs in terms of electricity.
*   **📱 Access Anywhere:** Seamlessly access your dashboard from your laptop, phone, or tablet via your private Tailscale network.

## 🚀 Key Features

### 1. Fully Offline & Private
Bring your own uncensored models. Perform your own processing. Store your own files. No internet required for core functionality.

### 2. API Ready
Prefer cloud models? Plug in your API keys and switch modes instantly.

### 3. Cross-Device Accessibility
Designed to be responsive and functional on:
*   💻 Laptops
*   📱 Phones
*   📟 Tablets

### 4. Performance Optimized
Built for speed and efficiency, leveraging local hardware acceleration for rapid image generation and fluid code assistance.

## 🔮 Future Roadmap

*   **Getartcraft Integration:** Implementation of "Craft Anything" capabilities directly within the Lumen Code environment.
*   **Enhanced Artifact Management:** Better visualization and management of generated code, images, and files.
*   **Expanded Model Support:** Easy configuration for additional open-weight models.

## 🛠️ Tech Stack

*   **Frontend:** Custom Vanilla JS/CSS SPA (No external font or CDN dependencies).
*   **Backend:** Lightweight PowerShell Gateway managing local engine switching.
*   **Code Engine:** Embedded OpenCode (forked for privacy and control).
*   **Networking:** Tailscale for secure, NAT-traversing remote access.


## 🚀 Getting Started

1.  **Clone the repository:**

2.  **Deploy to your personal Data Center:**

3.  **Access the Dashboard:**
    *   Ensure your device is connected to your Tailscale network.
    *   Navigate to `https://<your-desktop-tailnet-name>.ts.net/`

## 📝 License

This project is licensed under the [MIT License](LICENSE).
